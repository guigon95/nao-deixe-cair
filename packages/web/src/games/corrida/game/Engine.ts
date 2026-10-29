import { DASH, SCORING, SIM, SWARM } from './config';
import { speedAt, tierAt } from './Difficulty';
import { createRunner, runnerSpeed, stepRunner, type Controls, type StepSink } from './Physics';
import { Score } from './Score';
import { Track } from './Track';
import { GameState, type Crate, type DeathCause, type Fruit, type GameEvent, type Rock, type Runner, type Spring, type Thorns } from './types';
import { createRng, randomSeed } from '../../../shared/random';
import type { Storage } from '../../../shared/storage/storage';

export interface EngineOptions {
  storage: Storage;
  /** Semente fixa (testes e `?seed=`). Sem ela, cada partida sorteia. */
  seed?: number;
  resumeDelay?: number;
}

type Listener = (e: GameEvent) => void;

const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  READY: [GameState.PLAYING],
  PLAYING: [GameState.PAUSED, GameState.GAME_OVER, GameState.READY],
  PAUSED: [GameState.RESUMING, GameState.PLAYING, GameState.READY],
  RESUMING: [GameState.PLAYING, GameState.PAUSED, GameState.READY],
  GAME_OVER: [GameState.PLAYING, GameState.READY],
};

/** Intervalo para capins contarem como sequência (o som sobe de tom). */
const STREAK_WINDOW = 0.7;

/**
 * Simulação da partida — sem DOM, sem React, sem relógio próprio. Passo fixo
 * de 1/120 s com acumulador limitado: o resultado não depende do FPS.
 */
export class Engine {
  state: GameState = GameState.READY;
  readonly runner: Runner = createRunner(0);
  readonly track: Track;
  readonly score: Score;
  /** Tempo de partida simulado (s). */
  elapsed = 0;
  /** Distância do enxame atrás da capivara (u). 0 = alcançou. */
  swarm: number = SWARM.start;
  /** Capins no medidor do dash. */
  meter = 0;
  holding = false;
  alpha = 0;
  resumeCountdown = 0;
  runId = 0;
  totalSteps = 0;
  /** Tempo desde o fim da partida (animação de derrota). */
  deadTime = 0;
  deathCause: DeathCause | null = null;
  /** Nível de dificuldade atual (o HUD avisa quando sobe). */
  tier = 0;
  private pendingPress = false;
  private pendingDrop = false;
  private pendingDash = false;
  private accumulator = 0;
  private streak = 0;
  private sinceFruit = Infinity;
  private listeners = new Set<Listener>();
  private readonly fixedSeed?: number;
  private readonly resumeDelay: number;
  private readonly ctl: Controls = { hold: false, pressed: false, drop: false };
  private readonly sink: StepSink;

  constructor(opts: EngineOptions) {
    this.fixedSeed = opts.seed;
    this.resumeDelay = opts.resumeDelay ?? 1.2;
    this.score = new Score(opts.storage);
    const seed = opts.seed ?? randomSeed();
    this.track = new Track(createRng(seed));
    this.sink = this.createSink();
    this.track.update(0, 0, speedAt(0));
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private setState(next: GameState): boolean {
    if (next === this.state || !TRANSITIONS[this.state].includes(next)) return false;
    const previous = this.state;
    this.state = next;
    this.accumulator = 0;
    this.emit({ type: 'state', state: next, previous });
    return true;
  }

  get speed(): number {
    return speedAt(this.elapsed);
  }

  /** Velocidade real da capivara (com caixote/dash). */
  get runSpeed(): number {
    return runnerSpeed(this.runner, this.speed);
  }

  get meterFull(): boolean {
    return this.meter >= DASH.meterMax;
  }

  start(): void {
    if (this.state !== GameState.READY && this.state !== GameState.GAME_OVER && this.state !== GameState.PAUSED) return;
    this.runId++;
    const seed = this.fixedSeed !== undefined ? this.fixedSeed + this.runId - 1 : randomSeed();
    this.track.reset(createRng(seed));
    Object.assign(this.runner, createRunner(0));
    this.score.reset(0);
    this.elapsed = 0;
    this.alpha = 0;
    this.swarm = SWARM.start;
    this.meter = 0;
    this.deadTime = 0;
    this.deathCause = null;
    this.tier = 0;
    this.streak = 0;
    this.sinceFruit = Infinity;
    this.resumeCountdown = 0;
    this.pendingPress = this.pendingDrop = this.pendingDash = false;
    this.holding = false;
    this.track.update(0, 0, speedAt(0));
    this.setState(GameState.PLAYING);
  }

  pause(): void {
    if (this.state === GameState.PLAYING || this.state === GameState.RESUMING) {
      this.setHolding(false);
      this.setState(GameState.PAUSED);
    }
  }

  resume(): void {
    if (this.state !== GameState.PAUSED) return;
    this.setHolding(false);
    if (this.resumeDelay <= 0) {
      this.setState(GameState.PLAYING);
      return;
    }
    this.resumeCountdown = this.resumeDelay;
    this.setState(GameState.RESUMING);
  }

  toMenu(): void {
    this.setHolding(false);
    if (this.setState(GameState.READY)) {
      // Menu mostra a capivara correndo no começo do percurso.
      this.track.reset(createRng(this.fixedSeed ?? randomSeed()));
      Object.assign(this.runner, createRunner(0));
      this.swarm = SWARM.start;
      this.elapsed = 0;
    }
  }

  /** Dedo/tecla de pulo. Apertar (borda) pula; manter planeja. */
  setHolding(h: boolean): void {
    if (h === this.holding) return;
    this.holding = h;
    if (h && this.state === GameState.PLAYING) this.pendingPress = true;
  }

  /** Deslizar para baixo / ↓: desce rápido ou atravessa o galho. */
  drop(): void {
    if (this.state === GameState.PLAYING) this.pendingDrop = true;
  }

  /** Deslizar para a direita / →: dash, se o medidor estiver cheio. */
  dash(): boolean {
    if (this.state !== GameState.PLAYING || !this.meterFull || this.runner.dash > 0) return false;
    this.pendingDash = true;
    return true;
  }

  /** Avança o tempo real `frameDt` (s). Retorna quantos passos fixos rodaram. */
  advance(frameDt: number): number {
    if (!(frameDt > 0)) return 0;
    const dt = Math.min(frameDt, SIM.maxFrameTime);
    if (this.state === GameState.GAME_OVER) {
      this.deadTime += dt;
      return 0;
    }
    if (this.state === GameState.RESUMING) {
      this.resumeCountdown -= dt;
      if (this.resumeCountdown <= 0) {
        this.resumeCountdown = 0;
        this.setState(GameState.PLAYING);
      }
      return 0;
    }
    if (this.state === GameState.READY) {
      this.attract(dt);
      return 0;
    }
    if (this.state !== GameState.PLAYING) {
      this.alpha = 0;
      return 0;
    }
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= SIM.fixedDt && this.state === GameState.PLAYING) {
      this.step(SIM.fixedDt);
      this.accumulator -= SIM.fixedDt;
      steps++;
    }
    this.alpha = this.state === GameState.PLAYING ? this.accumulator / SIM.fixedDt : 0;
    return steps;
  }

  /** Um passo fixo de simulação (público para testes). */
  step(dt: number): void {
    const r = this.runner;
    this.totalSteps++;
    this.sinceFruit += dt;
    // Velocidade do início do passo (o planejador usa a mesma convenção).
    const base = this.speed;
    this.elapsed += dt;

    if (this.pendingDash && this.meterFull && r.dash <= 0) {
      r.dash = DASH.duration;
      r.vy = 0;
      r.fastFall = false;
      this.meter = 0;
      this.emit({ type: 'dash', on: true });
    }
    this.pendingDash = false;
    const wasDashing = r.dash > 0;
    const wasGliding = r.gliding;

    const ctl = this.ctl;
    ctl.hold = this.holding;
    ctl.pressed = this.pendingPress;
    ctl.drop = this.pendingDrop;
    this.pendingPress = false;
    if (this.pendingDrop && !r.grounded && !r.fastFall) this.emit({ type: 'fastFall' });
    this.pendingDrop = false;

    const death = stepRunner(r, ctl, this.track.level, base, dt, this.sink);

    if (wasDashing && r.dash <= 0) this.emit({ type: 'dash', on: false });
    if (r.gliding !== wasGliding) this.emit({ type: 'glide', on: r.gliding });

    // Enxame: ganha terreno quando a capivara é atrasado, perde quando ele corre (ou no dash).
    // Velocidade real do passo (no cipó o pêndulo manda no x).
    const actual = (r.x - r.prevX) / dt;
    this.swarm += (actual - base) * dt;
    if (this.swarm < SWARM.rest) this.swarm = Math.min(SWARM.rest, this.swarm + SWARM.recover * dt);
    else this.swarm = SWARM.rest;

    this.score.tick(r.x);
    this.track.update(r.x, this.elapsed, base);
    const tier = tierAt(this.elapsed);
    if (tier !== this.tier) this.tier = tier;

    if (death) return this.die(death);
    if (this.swarm <= 0) return this.die('swarm');
    if (this.score.checkRecord()) this.emit({ type: 'newRecord', score: this.score.score });
  }

  private die(cause: DeathCause): void {
    const r = this.runner;
    this.deathCause = cause;
    this.deadTime = 0;
    if (cause === 'swarm') this.swarm = 0;
    const res = this.score.finish();
    this.setHolding(false);
    this.setState(GameState.GAME_OVER);
    this.emit({ type: 'death', cause, x: r.x, y: r.y, ...res });
  }

  /** Menu: a capivara corre sozinho pelo começo do percurso (sem obstáculos). */
  private attract(dt: number): void {
    const r = this.runner;
    r.prevX = r.x;
    r.prevY = r.y;
    r.x += 120 * dt;
    r.landedAt += dt;
    if (r.x > 500) r.prevX = r.x = 0;
    this.alpha = 1;
  }

  private createSink(): StepSink {
    return {
      jump: (r) => this.emit({ type: 'jump', x: r.x, y: r.y }),
      land: (r, hard) => this.emit({ type: 'land', x: r.x, y: r.y, hard }),
      crate: (c: Crate, stomp, r) => {
        if (c.broken) return;
        c.broken = true;
        c.brokenAt = this.elapsed;
        const dashing = r.dash > 0 || r.dashTail > 0;
        if (stomp) this.score.addBonus(SCORING.stomp);
        else if (dashing) this.score.addBonus(SCORING.smash);
        else r.slow = Math.min(r.slow, SWARM.slowFactor);
        this.emit({ type: 'crate', x: (c.x0 + c.x1) / 2, y: c.top / 2, stomp: stomp || dashing });
      },
      smash: (o: Rock | Thorns) => {
        if (o.broken) return;
        o.broken = true;
        this.score.addBonus(SCORING.smash);
        this.emit({ type: 'smash', x: (o.x0 + o.x1) / 2, y: o.top / 2 });
      },
      spring: (s: Spring, r) => {
        s.usedAt = this.elapsed;
        this.emit({ type: 'spring', x: r.x, y: s.top });
      },
      fruit: (f: Fruit) => {
        if (f.taken) return;
        f.taken = true;
        this.streak = this.sinceFruit < STREAK_WINDOW ? this.streak + 1 : 1;
        this.sinceFruit = 0;
        this.score.addFruit();
        const wasFull = this.meterFull;
        this.meter = Math.min(DASH.meterMax, this.meter + 1);
        this.emit({ type: 'fruit', x: f.x, y: f.y, streak: this.streak, meterFull: !wasFull && this.meterFull });
      },
      grab: (_v, r) => this.emit({ type: 'vine', on: true, x: r.x, y: r.y }),
      letGo: (r) => this.emit({ type: 'vine', on: false, x: r.x, y: r.y }),
    };
  }
}
