import { ARCADE, FLIGHT, GROUND, MANEUVERS, PLANE, SCORING, SIM, type FlightParams, type PhysicsMode } from './config';
import { createScheme, type ControlScheme, type ControlSchemeId } from './Controls';
import { ManeuverDetector } from './Maneuvers';
import { createPlane, stepArcade, stepPlane, type PlaneState } from './Plane';
import { Score } from './Score';
import { GameState, type GameEvent, type ManeuverKind, type Obstacle } from './types';
import { ARCADE_DIFFICULTY, World } from './World';
import { difficultyAt as ballDifficulty } from '../../bolinha/game/Difficulty';
import { createRng, randomSeed } from '../../../shared/random';
import type { Storage } from '../../../shared/storage/storage';

export interface EngineOptions {
  storage: Storage;
  /** Semente fixa (testes). Sem ela, cada partida usa uma semente aleatória. */
  seed?: number;
  scheme?: ControlSchemeId;
  /** "bolinha" (padrão): física idêntica à da bolinha. "voo": física de voo com loops. */
  physics?: PhysicsMode;
  flight?: FlightParams;
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

/** Manobras "grandes": disparam a câmera lenta curtinha. */
const BIG: ReadonlySet<ManeuverKind> = new Set(['loop', 'halfLoop', 'stallRecovery', 'rasante']);

/**
 * Simulação da partida do avião — sem DOM, sem React, sem relógio próprio.
 * Passo fixo com acumulador limitado (como o motor da bolinha).
 */
export class Engine {
  state: GameState = GameState.READY;
  readonly plane: PlaneState;
  readonly world: World;
  readonly score: Score;
  readonly maneuvers = new ManeuverDetector();
  scheme: ControlScheme;
  readonly physics: PhysicsMode;
  /** Tempo de partida simulado (s). */
  elapsed = 0;
  holding = false;
  alpha = 0;
  resumeCountdown = 0;
  runId = 0;
  totalSteps = 0;
  /** Câmera lenta restante (s reais) — o renderizador e o som leem. */
  slowmo = 0;
  /** Desligada com "menos movimento". */
  slowmoEnabled = true;
  /** Tempo encostado no chão (s), para a tolerância. */
  groundTime = 0;
  private sinceGround = Infinity;
  private accumulator = 0;
  private listeners = new Set<Listener>();
  private readonly flight: FlightParams;
  private readonly fixedSeed?: number;
  private readonly resumeDelay: number;

  constructor(opts: EngineOptions) {
    this.flight = opts.flight ?? FLIGHT;
    this.physics = opts.physics ?? 'bolinha';
    this.fixedSeed = opts.seed;
    this.resumeDelay = opts.resumeDelay ?? 1.2;
    this.score = new Score(opts.storage);
    this.scheme = createScheme(opts.scheme ?? 'c');
    const seed = opts.seed ?? randomSeed();
    this.world = new World(createRng(seed), seed, this.physics === 'bolinha' ? ARCADE.corridorCeiling : undefined, this.physics === 'bolinha' ? ARCADE_DIFFICULTY : undefined);
    this.plane = createPlane(0, PLANE.startAltitude, PLANE.startSpeed);
    this.placeAtStart();
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

  private placeAtStart() {
    const p = this.plane;
    const y = this.world.terrain.height(0) + PLANE.startAltitude;
    Object.assign(p, createPlane(0, y, this.physics === 'bolinha' ? ballDifficulty(0).speed : PLANE.startSpeed));
    this.world.update(0, 0);
  }

  setScheme(id: ControlSchemeId): void {
    if (this.scheme.id !== id) this.scheme = createScheme(id);
  }

  start(): void {
    if (this.state !== GameState.READY && this.state !== GameState.GAME_OVER && this.state !== GameState.PAUSED) return;
    this.runId++;
    const seed = this.fixedSeed !== undefined ? this.fixedSeed + this.runId - 1 : randomSeed();
    this.world.reset(createRng(seed), seed);
    this.placeAtStart();
    this.scheme.reset();
    this.maneuvers.reset(this.plane.phi);
    this.score.reset(this.plane.x);
    this.elapsed = 0;
    this.alpha = 0;
    this.slowmo = 0;
    this.groundTime = 0;
    this.sinceGround = Infinity;
    this.rollsPaid = 0;
    this.resumeCountdown = 0;
    this.holding = false;
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
    this.setState(GameState.READY);
  }

  /** Velocidade horizontal atual (u/s). */
  get forwardSpeed(): number {
    return this.physics === 'bolinha' ? ballDifficulty(this.elapsed).speed : Math.cos(this.plane.phi) * this.plane.speed;
  }

  setHolding(h: boolean): void {
    if (h === this.holding) return;
    this.holding = h;
    if (h) this.scheme.press(this.elapsed);
    else this.scheme.release(this.elapsed);
  }

  /** Deslize vertical na tela (esquema B). */
  swipe(dyPerSecond: number): void {
    if (this.state === GameState.PLAYING) this.scheme.swipe(this.elapsed, dyPerSecond);
  }

  /** Avança o tempo real `frameDt` (s). Retorna quantos passos fixos rodaram. */
  advance(frameDt: number): number {
    if (!(frameDt > 0)) return 0;
    let dt = Math.min(frameDt, SIM.maxFrameTime);
    if (this.state === GameState.RESUMING) {
      this.resumeCountdown -= dt;
      if (this.resumeCountdown <= 0) {
        this.resumeCountdown = 0;
        this.setState(GameState.PLAYING);
      }
      return 0;
    }
    if (this.state !== GameState.PLAYING) {
      this.alpha = 0;
      return 0;
    }
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - dt);
      dt *= MANEUVERS.slowmoScale;
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

  /** Um passo fixo da simulação. */
  step(dt: number): void {
    if (this.state !== GameState.PLAYING) return;
    this.totalSteps++;
    const p = this.plane;
    const wasStalled = this.maneuvers.stalled;
    if (this.physics === 'bolinha') {
      // Mesma física vertical e mesma velocidade das barreiras da bolinha.
      stepArcade(p, this.holding, ballDifficulty(this.elapsed).speed, dt);
    } else stepPlane(p, this.scheme.command(this.elapsed, p), dt, this.flight);
    this.elapsed += dt;
    this.world.update(p.x, dt);

    // ---- Chão: rasante permitido, batida de bico não ----
    const terrain = this.world.terrain;
    const ground = terrain.height(p.x);
    const wasOnGround = p.onGround;
    if (this.physics === 'bolinha') {
      // Encostou no chão: batida (não deixe cair!).
      if (p.y - 5 <= ground) {
        p.y = ground + 5;
        this.crash('ground');
        return;
      }
    } else if (p.y - 5 <= ground) {
      const slope = terrain.slope(p.x);
      let rel = p.phi - slope;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const upright = Math.cos(p.phi) > 0.2;
      const gentle = upright && rel > -GROUND.skidAngle;
      if (gentle || (upright && this.sinceGround <= GROUND.coyoteTime)) {
        p.y = ground + 5;
        if (rel < 0) p.phi -= rel; // alinha com o chão (sem perder o "giro" acumulado)
        p.speed *= Math.max(0, 1 - GROUND.skidFriction * dt);
        // Rasante é passagem, não pouso: sem velocidade de voo no chão, acabou.
        if (p.speed < this.flight.stallSpeed * GROUND.minSkidSpeed) {
          this.crash('ground');
          return;
        }
        p.onGround = true;
        this.groundTime += dt;
        this.sinceGround = 0;
      } else {
        this.crash('ground');
        return;
      }
    } else {
      p.onGround = false;
      this.sinceGround += dt;
    }
    if (p.onGround !== wasOnGround) this.emit({ type: 'skid', on: p.onGround, x: p.x, y: p.y });

    // ---- Obstáculos e anéis ----
    if (this.collide()) return;

    // ---- Manobras e pontuação ----
    const found = this.maneuvers.update(p, p.y - ground, dt);
    for (const d of found) this.award(d.kind, d.base);
    if (this.maneuvers.stalled !== wasStalled) this.emit({ type: 'stall', on: this.maneuvers.stalled });
    if (this.scheme.id === 'b') {
      const b = this.scheme as ControlScheme & { rolls?: number };
      while ((b.rolls ?? 0) > this.rollsPaid) {
        this.rollsPaid++;
        this.award('roll', 30);
      }
    }
    const lost = this.score.tick(dt, p.x);
    if (lost > 1) this.emit({ type: 'comboLost', multiplier: lost });
    if (this.score.checkRecord()) this.emit({ type: 'newRecord', score: this.score.score });
  }

  private rollsPaid = 0;

  private award(kind: ManeuverKind, base: number) {
    const p = this.plane;
    const m = this.score.add(kind, base, p.x, p.y);
    if (BIG.has(kind) && this.slowmoEnabled) this.slowmo = MANEUVERS.slowmoTime;
    this.emit({ type: 'maneuver', m });
  }

  /** Testa batidas, raspões e anéis. Retorna true se bateu. */
  private collide(): boolean {
    const p = this.plane;
    const r = PLANE.hitRadius;
    const nx = p.x + Math.cos(p.phi) * PLANE.noseOffset;
    const ny = p.y + Math.sin(p.phi) * PLANE.noseOffset;
    for (const o of this.world.obstacles) {
      if (!o.active || Math.abs(o.x - p.x) > 80) continue;
      const d = Math.min(distanceTo(o, p.x, p.y), distanceTo(o, nx, ny));
      if (d < r) {
        this.crash(o.kind);
        return true;
      }
      if (!o.grazed && d < r + MANEUVERS.grazeMargin) {
        o.grazed = true;
        this.award('graze', SCORING.graze);
      }
    }
    for (const ring of this.world.rings) {
      if (!ring.active || ring.passed) continue;
      if (p.prevX < ring.x && p.x >= ring.x && Math.abs(p.y - ring.y) < ring.r - 3) {
        ring.passed = true;
        this.award('ring', ring.high ? SCORING.ring * 2 : SCORING.ring);
      }
    }
    return false;
  }

  private crash(cause: 'ground' | Obstacle['kind']): void {
    this.setHolding(false);
    const result = this.score.finish();
    this.slowmo = 0;
    this.setState(GameState.GAME_OVER);
    this.emit({ type: 'crash', x: this.plane.x, y: this.plane.y, cause, ...result });
  }
}

/** Distância de um ponto à superfície do obstáculo (negativa = dentro). */
export function distanceTo(o: Obstacle, x: number, y: number): number {
  if (o.kind === 'tower') {
    const cx = Math.max(o.x - o.r, Math.min(x, o.x + o.r));
    const cy = Math.max(o.baseY, Math.min(y, o.top));
    if (cx === x && cy === y) return -1;
    return Math.hypot(x - cx, y - cy);
  }
  return Math.hypot(x - o.x, y - o.y) - o.r;
}
