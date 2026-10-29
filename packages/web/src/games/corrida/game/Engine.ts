import { CONTINUES, DASH, ITEMS, MAGNET, SCORING, SHIELD, SIM, SWARM } from './config';
import { speedAt, tierAt } from './Difficulty';
import { createRunner, runnerSpeed, stepRunner, type Controls, type StepSink } from './Physics';
import { CANOPY } from './patterns';
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
  /** Vidas por partida para continuar (padrão CONTINUES.lives; 0 = sem continuar). */
  lives?: number;
}

type Listener = (e: GameEvent) => void;

const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  READY: [GameState.PLAYING],
  PLAYING: [GameState.PAUSED, GameState.CONTINUE, GameState.GAME_OVER, GameState.READY],
  CONTINUE: [GameState.RESUMING, GameState.PLAYING, GameState.GAME_OVER],
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
  /** Ímã de capim: segundos restantes (0 = desligado). */
  magnet = 0;
  /** Embalo do ímã (0..1): rampa da velocidade extra. */
  boost = 0;
  /** Escudo de vitória-régia ativo (aguenta uma batida). */
  shield = false;
  /** Pousada na copa das árvores (para avisar uma vez por subida). */
  private onCanopy = false;
  private pendingPress = false;
  private pendingDrop = false;
  private pendingDash = false;
  private accumulator = 0;
  private streak = 0;
  private sinceFruit = Infinity;
  private listeners = new Set<Listener>();
  private readonly fixedSeed?: number;
  private readonly resumeDelay: number;
  /** Vidas por partida e quantas ainda dá para gastar nesta. */
  readonly lives: number;
  livesLeft = 0;
  private readonly ctl: Controls = { hold: false, pressed: false, drop: false };
  private readonly sink: StepSink;

  constructor(opts: EngineOptions) {
    this.fixedSeed = opts.seed;
    this.resumeDelay = opts.resumeDelay ?? 1.2;
    this.lives = Math.max(0, Math.floor(opts.lives ?? CONTINUES.lives));
    this.livesLeft = this.lives;
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
  /** Multiplicador de velocidade do embalo do ímã (1 = normal). */
  get speedFactor(): number {
    return 1 + MAGNET.boost * this.boost;
  }

  get runSpeed(): number {
    return runnerSpeed(this.runner, this.speed * this.speedFactor);
  }

  get meterFull(): boolean {
    return this.meter >= DASH.meterMax;
  }

  start(): void {
    if (this.state !== GameState.READY && this.state !== GameState.GAME_OVER && this.state !== GameState.PAUSED) return;
    this.runId++;
    this.livesLeft = this.lives;
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
    this.onCanopy = false;
    this.magnet = 0;
    this.boost = 0;
    this.shield = false;
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
    if (this.state === GameState.GAME_OVER || this.state === GameState.CONTINUE) {
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
    // Velocidade do início do passo (o planejador usa a mesma convenção), com o
    // embalo do ímã (+10%, sobe e desce em 0,5 s).
    const target = this.magnet > 0 ? 1 : 0;
    const k = dt / MAGNET.boostRamp;
    this.boost = target > this.boost ? Math.min(1, this.boost + k) : Math.max(0, this.boost - k);
    const base = this.speed * this.speedFactor;
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

    this.stepItems(r, dt);
    this.score.tick(r.x);
    this.track.update(r.x, this.elapsed, base);
    const tier = tierAt(this.elapsed);
    if (tier !== this.tier) this.tier = tier;

    if (death && this.shield && this.useShield(death)) return;
    if (death) return this.die(death);
    if (this.swarm <= 0) return this.die('swarm');
    if (this.score.checkRecord()) this.emit({ type: 'newRecord', score: this.score.score });
  }

  /** Pega ímãs e, com o ímã ligado, puxa os capins próximos até a capivara. */
  private stepItems(r: Runner, dt: number): void {
    const lvl = this.track.level;
    const cx = r.x;
    const cy = r.y + 17;
    for (const u of lvl.powerups) {
      if (u.x - ITEMS.pickup > cx + 20) break;
      if (u.taken || Math.abs(u.x - cx) > ITEMS.pickup + 13 || Math.abs(u.y - cy) > ITEMS.pickup + 17) continue;
      u.taken = true;
      if (u.kind === 'magnet') {
        const was = this.magnet > 0;
        this.magnet = MAGNET.duration;
        if (!was) this.emit({ type: 'magnet', on: true, x: u.x, y: u.y });
      } else if (u.kind === 'shield') {
        if (!this.shield) this.emit({ type: 'shield', on: true, x: u.x, y: u.y });
        this.shield = true;
      }
    }
    if (this.magnet <= 0) return;
    this.magnet -= dt;
    const speed = MAGNET.pull + runnerSpeed(r, this.speed);
    for (const f of lvl.fruits) {
      if (f.taken) continue;
      const dx = f.x - cx;
      if (dx > MAGNET.reachAhead) break;
      if (dx < -MAGNET.reachBehind) continue;
      const dy = f.y - cy;
      if (Math.abs(dy) > MAGNET.reachUp) continue;
      const d = Math.hypot(dx, dy);
      if (d <= MAGNET.eat) {
        this.sink.fruit(f, r);
        continue;
      }
      const step = Math.min(d, speed * dt);
      f.x -= (dx / d) * step;
      f.y -= (dy / d) * step;
    }
    if (this.magnet <= 0) {
      this.magnet = 0;
      this.emit({ type: 'magnet', on: false, x: r.x, y: r.y });
    }
  }

  /**
   * O escudo aguenta a batida: na pedra/espinho, quebra o obstáculo (e o
   * que encostar logo depois); no rio, folhas de vitória-régia aparecem
   * debaixo da capivara até a outra margem. O escudo se gasta.
   */
  private useShield(cause: DeathCause): boolean {
    if (cause === 'swarm') return false;
    const r = this.runner;
    this.shield = false;
    if (cause === 'river') {
      const lvl = this.track.level;
      let end = r.x + 200;
      for (const g of lvl.ground) {
        if (g.x0 > r.x) {
          end = g.x0 + 10;
          break;
        }
      }
      const pad = { x0: r.x - 40, x1: end, y: 0, kind: 'vitoria' as const };
      let i = 0;
      while (i < lvl.platforms.length && lvl.platforms[i].x0 < pad.x0) i++;
      lvl.platforms.splice(i, 0, pad);
      r.y = r.prevY = 0;
      r.vy = 0;
      r.grounded = true;
      r.jumped = false;
      r.airTime = 0;
      r.fastFall = false;
      r.gliding = false;
    } else {
      r.dashTail = Math.max(r.dashTail, SHIELD.grace);
    }
    this.emit({ type: 'shield', on: false, x: r.x, y: r.y, saved: cause });
    return true;
  }

  private die(cause: DeathCause): void {
    const r = this.runner;
    this.deathCause = cause;
    this.deadTime = 0;
    if (cause === 'swarm') this.swarm = 0;
    // O recorde já fica salvo na batida (mesmo se fechar a aba na tela de continuar).
    const res = this.score.finish();
    this.setHolding(false);
    this.setState(this.livesLeft > 0 ? GameState.CONTINUE : GameState.GAME_OVER);
    this.emit({ type: 'death', cause, x: r.x, y: r.y, ...res, livesLeft: this.livesLeft });
  }

  /**
   * Gasta uma vida e continua de onde bateu: mesma pontuação, mesmo tempo
   * de partida (mesma velocidade), capim no medidor mantido, trecho à frente
   * limpo (chão contínuo, sem obstáculos), enxame afastado e contagem curta.
   */
  continueRun(): boolean {
    if (this.state !== GameState.CONTINUE || this.livesLeft <= 0) return false;
    this.livesLeft--;
    const r = this.runner;
    // Mesmo x; chão contínuo embaixo (mesmo se caiu no rio) e trecho livre à frente.
    const x = r.x;
    this.track.level.clearZone(x - CONTINUES.clearBehind, x + this.speed * CONTINUES.clearAhead);
    Object.assign(r, createRunner(x));
    this.swarm = Math.max(this.swarm, CONTINUES.swarm);
    this.deathCause = null;
    this.deadTime = 0;
    this.holding = false;
    this.pendingPress = this.pendingDrop = this.pendingDash = false;
    this.alpha = 0;
    this.score.unfreeze();
    this.emit({ type: 'continue', livesLeft: this.livesLeft });
    this.resumeCountdown = this.resumeDelay;
    if (this.resumeDelay <= 0) this.setState(GameState.PLAYING);
    else this.setState(GameState.RESUMING);
    return true;
  }

  /** Desiste de continuar: a partida termina de vez com a pontuação atual. */
  endRun(): void {
    if (this.state !== GameState.CONTINUE) return;
    this.livesLeft = 0;
    this.setState(GameState.GAME_OVER);
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
      land: (r, hard) => {
        this.emit({ type: 'land', x: r.x, y: r.y, hard });
        // Chegou à copa das árvores (uma vez por subida).
        const up = r.y >= CANOPY.y - 0.5;
        if (up && !this.onCanopy) this.emit({ type: 'canopy', x: r.x, y: r.y });
        this.onCanopy = up;
      },
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
