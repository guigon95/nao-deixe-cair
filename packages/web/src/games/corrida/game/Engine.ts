import { CONTINUES, CRATE_LOOT, DASH, GOLDEN, ITEMS, JUMP, MAGNET, MOUNT, MOUNTS, SCORING, SHIELD, SIM, SWARM, TOCA, type JumpParams } from './config';
import { speedAt, tierAt } from './Difficulty';
import { createRunner, runnerSpeed, stepRunner, type Controls, type StepSink } from './Physics';
import { CANOPY } from './patterns';
import { Score } from './Score';
import { Track } from './Track';
import { GameState, type Crate, type DeathCause, type Fruit, type GameEvent, type ItemKind, type Loot, type Mount, type Rock, type Runner, type Spring, type Thorns } from './types';
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
/** No resgate do rio pela ema, a capivara sai pelo menos desta altura. */
const PIT_SAFE_Y = -10;
/** Tucano carregando: voa esta altura acima dos pés da capivara. */
export const TUCANO_CARRY = 46;
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
  /** Dentro da toca (por baixo da terra). */
  inBurrow = false;
  /** Prêmios saindo dos caixotes, voando até a capivara. */
  readonly loot: Loot[] = [];
  /** Montaria (ema) solta, montada ou fugindo; null = nenhuma. */
  mount: Mount | null = null;
  /** Rampa da velocidade extra da montaria (0..1). */
  ride = 0;
  /** Velocidade extra da montaria atual (fica durante a rampa de saída). */
  private rideSpeed = 0;
  /** Tempo restante do capim dourado (s). */
  golden = 0;
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
    return (1 + MAGNET.boost * this.boost) * (1 + this.rideSpeed * this.ride);
  }

  get riding(): boolean {
    return this.mount?.state === 'ridden';
  }

  /** Tucano cansado: para de voar e procura o chão para deixar a capivara. */
  get tucanoTired(): boolean {
    const m = this.mount;
    return !!m && m.state === 'ridden' && m.animal === 'tucano' && m.t > MOUNT.tucanoTime;
  }

  /** Pulo (e voo) da montaria atual. */
  private get rideJump(): JumpParams {
    if (!this.riding || this.tucanoTired) return JUMP;
    return MOUNTS[this.mount!.animal].jump;
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
    this.golden = 0;
    this.inBurrow = false;
    this.loot.length = 0;
    this.mount = null;
    this.ride = 0;
    this.rideSpeed = 0;
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
    const kr = dt / MOUNT.ramp;
    this.ride = this.riding ? Math.min(1, this.ride + kr) : Math.max(0, this.ride - kr);
    // Montada não agarra cipó (montaria não balança); a anta atropela.
    if (this.riding) r.vineCooldown = Math.max(r.vineCooldown, 0.1);
    r.tank = this.riding && MOUNTS[this.mount!.animal].tank;
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

    const death = stepRunner(r, ctl, this.track.level, base, dt, this.sink, this.rideJump);

    if (wasDashing && r.dash <= 0) this.emit({ type: 'dash', on: false });
    if (r.gliding !== wasGliding) this.emit({ type: 'glide', on: r.gliding });

    // Enxame: ganha terreno quando a capivara é atrasado, perde quando ele corre (ou no dash).
    // Velocidade real do passo (no cipó o pêndulo manda no x).
    const actual = (r.x - r.prevX) / dt;
    this.swarm += (actual - base) * dt;
    if (this.swarm < SWARM.rest) this.swarm = Math.min(SWARM.rest, this.swarm + SWARM.recover * dt);
    else this.swarm = SWARM.rest;

    this.stepItems(r, dt);
    this.stepMount(r, dt);
    // Caiu no buraco escondido: a toca aparece e, um pouco mais fundo, entrou.
    if (!this.inBurrow && r.y < 0 && r.vy <= 0) {
      const b = this.track.level.burrowAt(r.x);
      if (b) {
        b.opened = true;
        // A ema não entra na toca: pula o buraco e vai embora.
        if (this.riding) this.dismount('toca');
        if (r.y < TOCA.below) {
          this.inBurrow = true;
          this.emit({ type: 'burrow', on: true, x: r.x, y: r.y });
        }
      }
    }
    this.score.tick(r.x);
    this.track.update(r.x, this.elapsed, base);
    const tier = tierAt(this.elapsed);
    if (tier !== this.tier) this.tier = tier;

    if (death && this.riding && this.dismount(death)) return;
    if (death && this.shield && this.useShield(death)) return;
    if (death) return this.die(death);
    if (this.swarm <= 0) return this.die('swarm');
    if (this.score.checkRecord()) this.emit({ type: 'newRecord', score: this.score.score });
  }

  /** Ema solta: corre à frente esperando; montada: acompanha; fugindo: dispara. */
  private stepMount(r: Runner, dt: number): void {
    const m = this.mount;
    if (!m) return;
    m.t += dt;
    const lvl = this.track.level;
    const v = runnerSpeed(r, this.speed * this.speedFactor);
    if (m.state === 'ridden') {
      m.x = r.x;
      m.y = r.y;
      m.vy = r.vy;
      // Tucano cansado: assim que chegar ao chão, deixa a capivara e vai embora.
      if (this.tucanoTired && r.grounded) this.dismount('tired');
      return;
    }
    if (m.animal === 'tucano') {
      this.stepTucano(m, r, v, dt);
      return;
    }
    if (m.state === 'free') {
      // Corre um pouco à frente; quando a capivara pula, deixa ela vir por cima.
      const target = r.grounded ? r.x + MOUNT.ahead : r.x + 2;
      m.x += (v + Math.max(-260, Math.min(260, (target - m.x) * 4))) * dt;
    } else {
      m.x += Math.max(v, this.speed) * MOUNT.flee * dt;
    }
    // Pulos da ema por conta própria (sobre buracos e no pulinho de sair do caixote).
    if (m.y > 0 || m.vy > 0) {
      m.vy -= JUMP.gravityDown * dt;
      m.y += m.vy * dt;
      if (m.y <= 0 && m.vy < 0) {
        if (lvl.groundAt(m.x)) {
          m.y = 0;
          m.vy = 0;
        } else m.vy = 700; // pula de novo por cima do rio
      }
    } else if (!lvl.groundAt(m.x + 30)) m.vy = 760;
    if (m.state === 'fleeing') {
      if (m.x > r.x + 1100 || m.t > 6) this.mount = null;
      return;
    }
    // Montar: caindo nas costas da ema.
    const feet = r.y - m.y;
    if (!r.grounded && !r.swinging && r.vy <= 0 && Math.abs(r.x - m.x) < MOUNT.catchDx && feet >= MOUNT.catchMin && feet <= MOUNT.catchMax) {
      m.state = 'ridden';
      m.t = 0;
      this.rideSpeed = MOUNTS[m.animal].speed;
      r.y = r.prevY = m.y;
      r.vy = m.y > 0 ? Math.max(0, m.vy) : 0;
      r.grounded = m.y <= 0 && lvl.groundAt(r.x);
      r.jumped = !r.grounded;
      r.cut = true;
      r.airTime = 0;
      r.glideTime = 0;
      r.gliding = false;
      r.fastFall = false;
      r.justLanded = true;
      r.landedAt = 0;
      this.emit({ type: 'mount', phase: 'ride', animal: m.animal, x: r.x, y: r.y });
      return;
    }
    if (m.t > MOUNT.freeTime) {
      m.state = 'fleeing';
      m.t = 0;
      this.emit({ type: 'mount', phase: 'off', animal: m.animal, x: m.x, y: m.y, reason: 'timeout' });
    }
  }

  /**
   * Tucano solto: voa à frente esperando (a capivara pula até ele para ser
   * carregada); fugindo, sobe e dispara.
   */
  private stepTucano(m: Mount, r: Runner, v: number, dt: number): void {
    if (m.state === 'fleeing') {
      m.x += Math.max(v, this.speed) * MOUNT.flee * dt;
      m.y += 160 * dt;
      if (m.x > r.x + 1100 || m.t > 6) this.mount = null;
      return;
    }
    const target = r.grounded ? r.x + MOUNT.ahead : r.x + 2;
    m.x += (v + Math.max(-260, Math.min(260, (target - m.x) * 4))) * dt;
    // Altura dos pés de quem ele carrega (o tucano voa ~46 acima disso).
    const hover = MOUNT.tucanoHover - TUCANO_CARRY + Math.sin(m.t * 4) * 5;
    m.y += (hover - m.y) * Math.min(1, dt * 6);
    // Pulando até ele: agarra a capivara e voa.
    if (!r.grounded && !r.swinging && Math.abs(r.x - m.x) < MOUNT.catchDx && Math.abs(r.y - m.y) < 32) {
      m.state = 'ridden';
      m.t = 0;
      this.rideSpeed = MOUNTS.tucano.speed;
      r.cut = true;
      r.gliding = false;
      r.fastFall = false;
      if (r.vy < 0) r.vy = 0;
      this.emit({ type: 'mount', phase: 'ride', animal: 'tucano', x: r.x, y: r.y });
      return;
    }
    if (m.t > MOUNT.freeTime) {
      m.state = 'fleeing';
      m.t = 0;
      this.emit({ type: 'mount', phase: 'off', animal: 'tucano', x: m.x, y: m.y, reason: 'timeout' });
    }
  }

  /**
   * Batida montada: a capivara pula da ema (sem perder vida) e a ema dispara
   * embora. Na pedra/espinho/caixote o obstáculo quebra; no rio, a ema
   * arremessa a capivara para cima (segunda chance).
   */
  private dismount(cause: DeathCause | 'crate' | 'toca' | 'tired'): boolean {
    if (cause === 'swarm') return false;
    const m = this.mount;
    if (!m || m.state !== 'ridden') return false;
    const r = this.runner;
    m.state = 'fleeing';
    m.t = 0;
    m.x = r.x;
    m.y = Math.max(0, r.y);
    m.vy = cause === 'toca' ? 760 : 0;
    if (cause !== 'toca' && cause !== 'tired') {
      r.vy = cause === 'river' ? JUMP.springVelocity : JUMP.jumpVelocity * MOUNT.hop;
      r.grounded = false;
      r.jumped = true;
      r.cut = true;
      r.airTime = 0;
      r.glideTime = 0;
      r.gliding = false;
      r.fastFall = false;
      if (cause !== 'river') r.dashTail = Math.max(r.dashTail, SHIELD.grace);
      if (cause === 'river') r.y = Math.max(r.y, PIT_SAFE_Y);
    }
    this.emit({ type: 'mount', phase: 'off', animal: m.animal, x: r.x, y: r.y, reason: cause === 'toca' || cause === 'tired' || cause === 'river' ? cause : 'hit' });
    return true;
  }

  /** Efeito de um item especial pego (no percurso ou saído de um caixote). */
  private applyItem(kind: ItemKind, x: number, y: number): void {
    if (kind === 'magnet') {
      const was = this.magnet > 0;
      this.magnet = MAGNET.duration;
      if (!was) this.emit({ type: 'magnet', on: true, x, y });
    } else if (kind === 'shield') {
      if (!this.shield) this.emit({ type: 'shield', on: true, x, y });
      this.shield = true;
    } else if (kind === 'acai') {
      // Açaí: enche o medidor da Disparada de uma vez.
      this.meter = DASH.meterMax;
      this.emit({ type: 'acai', x, y });
    } else if (kind === 'golden') {
      if (this.golden <= 0) this.emit({ type: 'golden', on: true, x, y });
      this.golden = GOLDEN.duration;
      this.score.mult = GOLDEN.mult;
    }
  }

  /** Abre um caixote quebrado: o que tinha dentro pula para fora. */
  private spill(c: Crate): void {
    const loot = c.loot;
    if (!loot) return;
    c.loot = undefined;
    const cx = (c.x0 + c.x1) / 2;
    if (loot.kind === 'mount') {
      if (this.mount && this.mount.state !== 'fleeing') return; // já tem uma
      this.mount = { animal: loot.animal, state: 'free', x: cx, y: loot.animal === 'tucano' ? c.top : c.top * 0.5, vy: loot.animal === 'tucano' ? 0 : 520, t: 0 };
      this.emit({ type: 'mount', phase: 'appear', animal: loot.animal, x: cx, y: c.top });
      return;
    }
    const n = loot.kind === 'capim' ? loot.n : 1;
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;
      this.loot.push({ x: cx, y: c.top * 0.6, vx: 60 + k * 260, vy: 520 + Math.abs(k) * -120, t: 0, kind: loot.kind === 'capim' ? 'capim' : loot.item });
    }
    this.emit({ type: 'loot', x: cx, y: c.top, kind: loot.kind === 'capim' ? 'capim' : loot.item, n });
  }

  /** Prêmios dos caixotes: pulinho para fora e depois voam até a capivara. */
  private stepLoot(r: Runner, dt: number): void {
    if (!this.loot.length) return;
    const tx = r.x;
    const ty = r.y + 17;
    const vRun = runnerSpeed(r, this.speed * this.speedFactor);
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.t += dt;
      if (l.t < CRATE_LOOT.pop) {
        l.vy -= 1800 * dt;
        l.x += (l.vx + vRun * 0.6) * dt;
        l.y += l.vy * dt;
      } else {
        const dx = tx - l.x;
        const dy = ty - l.y;
        const d = Math.hypot(dx, dy);
        const step = (CRATE_LOOT.fly + vRun) * dt;
        if (d <= Math.max(CRATE_LOOT.reach, step)) {
          this.loot.splice(i, 1);
          if (l.kind === 'capim') this.sink.fruit({ x: tx, y: ty, taken: false, risky: false }, r);
          else this.applyItem(l.kind, tx, ty);
          continue;
        }
        l.x += (dx / d) * step;
        l.y += (dy / d) * step;
      }
    }
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
      this.applyItem(u.kind, u.x, u.y);
    }
    this.stepLoot(r, dt);
    if (this.golden > 0) {
      this.golden -= dt;
      if (this.golden <= 0) {
        this.golden = 0;
        this.score.mult = 1;
        this.emit({ type: 'golden', on: false, x: r.x, y: r.y });
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
    if (this.mount?.state === 'ridden') {
      this.mount.state = 'fleeing';
      this.mount.t = 0;
    }
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
    this.inBurrow = false;
    this.mount = null;
    this.ride = 0;
    this.rideSpeed = 0;
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
        this.spill(c);
        const dashing = r.dash > 0 || r.dashTail > 0;
        if (stomp) this.score.addBonus(SCORING.stomp);
        else if (dashing) this.score.addBonus(SCORING.smash);
        else if (r.tank) this.score.addBonus(SCORING.smash);
        else if (this.riding) this.dismount('crate');
        else r.slow = Math.min(r.slow, SWARM.slowFactor);
        this.emit({ type: 'crate', x: (c.x0 + c.x1) / 2, y: c.top / 2, stomp: stomp || dashing || r.tank });
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
      burrowOut: (r) => {
        this.inBurrow = false;
        this.emit({ type: 'burrow', on: false, x: r.x, y: r.y });
      },
    };
  }
}
