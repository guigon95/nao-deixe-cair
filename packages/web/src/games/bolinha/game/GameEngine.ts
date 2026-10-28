import { BALL_X, ballBounds, CONTINUES, playfield, PHYSICS } from './config';
import { ballHitsBarrier, substepsFor } from './Collision';
import { difficultyAt } from './Difficulty';
import { ObstacleManager } from './ObstacleManager';
import { DEFAULT_PHYSICS, stepBall, type PhysicsParams } from './Physics';
import { createRng, randomSeed } from '../../../shared/random';
import { ScoreManager } from './ScoreManager';
import { CoinField } from './Coins';
import { GameState, type Ball, type GameEvent, type Storage } from './types';

export interface EngineOptions {
  storage: Storage;
  /** Semente fixa (testes). Sem ela, cada partida usa uma semente aleatória. */
  seed?: number;
  physics?: PhysicsParams;
  /** Duração da contagem antes de retomar (s). */
  resumeDelay?: number;
  /** Vidas por partida para continuar de onde parou (padrão: CONTINUES.lives; 0 = sem continuar). */
  lives?: number;
}

type Listener = (e: GameEvent) => void;

/** Transições permitidas da máquina de estados. */
const TRANSITIONS: Record<GameState, readonly GameState[]> = {
  READY: [GameState.PLAYING],
  PLAYING: [GameState.PAUSED, GameState.CONTINUE, GameState.GAME_OVER, GameState.READY],
  CONTINUE: [GameState.RESUMING, GameState.GAME_OVER],
  PAUSED: [GameState.RESUMING, GameState.PLAYING, GameState.READY],
  RESUMING: [GameState.PLAYING, GameState.PAUSED, GameState.READY],
  GAME_OVER: [GameState.PLAYING, GameState.READY],
};

/**
 * Simulação da partida — sem DOM, sem React, sem relógio próprio.
 * Quem chama `advance(dt)` (o GameLoop) fornece o tempo real; o motor
 * converte em passos fixos com acumulador limitado.
 */
export class GameEngine {
  state: GameState = GameState.READY;
  readonly ball: Ball;
  readonly obstacles: ObstacleManager;
  readonly score: ScoreManager;
  readonly coins: CoinField;
  /** Tempo de partida simulado (s). Base da curva de dificuldade. */
  elapsed = 0;
  holding = false;
  /** Fração do passo fixo ainda não simulada (0..1) — para interpolar o desenho. */
  alpha = 0;
  /** Segundos restantes da contagem de retomada. */
  resumeCountdown = 0;
  /** Vidas que ainda podem ser gastas para continuar nesta partida. */
  livesLeft = 0;
  /** Contador de partidas iniciadas (útil para efeitos e testes). */
  runId = 0;
  /** Total de passos fixos executados (diagnóstico/testes). */
  totalSteps = 0;

  private accumulator = 0;
  private listeners = new Set<Listener>();
  private readonly physics: PhysicsParams;
  private readonly fixedSeed?: number;
  private readonly resumeDelay: number;
  readonly lives: number;

  constructor(opts: EngineOptions) {
    this.lives = Math.max(0, Math.floor(opts.lives ?? CONTINUES.lives));
    this.livesLeft = this.lives;
    this.physics = opts.physics ?? DEFAULT_PHYSICS;
    this.fixedSeed = opts.seed;
    this.resumeDelay = opts.resumeDelay ?? 1.2;
    this.score = new ScoreManager(opts.storage);
    this.obstacles = new ObstacleManager(createRng(opts.seed ?? randomSeed()));
    // gerador separado: as moedas não alteram a sequência de barreiras de uma semente
    this.coins = new CoinField(createRng((opts.seed ?? randomSeed()) ^ 0x5eed));
    this.obstacles.onSpawn = (prev, next, n, speed) => this.coins.onBarrier(prev, next, n, speed);
    const mid = (playfield().top + playfield().bottom) / 2;
    this.ball = { x: BALL_X, y: mid, prevY: mid, vy: 0, radius: PHYSICS.ballRadius };
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: GameEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private setState(next: GameState): boolean {
    if (next === this.state) return false;
    if (!TRANSITIONS[this.state].includes(next)) return false;
    const previous = this.state;
    this.state = next;
    this.accumulator = 0; // nunca carrega tempo “velho” entre estados
    this.emit({ type: 'state', state: next, previous });
    return true;
  }

  /** Inicia (ou reinicia) uma partida limpa. */
  start(): void {
    if (this.state !== GameState.READY && this.state !== GameState.GAME_OVER && this.state !== GameState.PAUSED) return;
    const mid = (playfield().top + playfield().bottom) / 2;
    this.ball.y = this.ball.prevY = mid;
    this.ball.vy = 0;
    this.elapsed = 0;
    this.alpha = 0;
    this.resumeCountdown = 0;
    this.runId++;
    this.livesLeft = this.lives;
    this.score.reset();
    const seed = this.fixedSeed !== undefined ? this.fixedSeed + this.runId - 1 : randomSeed();
    this.coins.reset(createRng(seed ^ 0x5eed));
    this.obstacles.reset(createRng(seed));
    this.obstacles.fill(difficultyAt(0));
    this.setState(GameState.PLAYING);
  }

  /**
   * Gasta uma vida e continua de onde bateu: mesma pontuação, mesmo tempo
   * (mesma dificuldade), barreiras próximas removidas, bolinha alinhada ao
   * próximo vão e contagem curta antes de voltar.
   */
  continueRun(): boolean {
    if (this.state !== GameState.CONTINUE || this.livesLeft <= 0) return false;
    this.livesLeft--;
    this.holding = false;
    const center = this.obstacles.clearAround(this.ball.x, CONTINUES.clearAhead);
    this.coins.clearBefore(this.ball.x + this.ball.radius);
    const { minY, maxY } = ballBounds(this.ball.radius);
    this.ball.y = this.ball.prevY = Math.min(maxY, Math.max(minY, center));
    this.ball.vy = 0;
    this.alpha = 0;
    this.score.unfreeze();
    this.emit({ type: 'continue', livesLeft: this.livesLeft });
    this.resumeCountdown = this.resumeDelay;
    this.setState(GameState.RESUMING);
    if (this.resumeDelay <= 0) this.setState(GameState.PLAYING);
    return true;
  }

  /** Desiste de continuar: a partida termina de vez com a pontuação atual. */
  endRun(): void {
    if (this.state !== GameState.CONTINUE) return;
    this.livesLeft = 0;
    this.setState(GameState.GAME_OVER);
  }

  pause(): void {
    if (this.state === GameState.PLAYING || this.state === GameState.RESUMING) {
      this.holding = false;
      this.setState(GameState.PAUSED);
    }
  }

  /** Volta da pausa com uma contagem curta, para o jogador se reposicionar. */
  resume(): void {
    if (this.state !== GameState.PAUSED) return;
    this.holding = false;
    if (this.resumeDelay <= 0) {
      this.setState(GameState.PLAYING);
      return;
    }
    this.resumeCountdown = this.resumeDelay;
    this.setState(GameState.RESUMING);
  }

  toMenu(): void {
    this.holding = false;
    this.setState(GameState.READY);
  }

  setHolding(h: boolean): void {
    this.holding = h;
  }

  /**
   * Avança o tempo real `frameDt` (s). Retorna quantos passos fixos rodaram.
   * O tempo por quadro é limitado (`maxFrameTime`): após um travamento ou
   * troca de aba, o jogo não “pula” para frente.
   */
  advance(frameDt: number): number {
    if (!(frameDt > 0)) return 0;
    const dt = Math.min(frameDt, PHYSICS.maxFrameTime);

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

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= PHYSICS.fixedDt && this.state === GameState.PLAYING) {
      this.step(PHYSICS.fixedDt);
      this.accumulator -= PHYSICS.fixedDt;
      steps++;
    }
    this.alpha = this.state === GameState.PLAYING ? this.accumulator / PHYSICS.fixedDt : 0;
    return steps;
  }

  /** Um passo fixo da simulação, subdividido se necessário contra tunelamento. */
  step(dt: number): void {
    if (this.state !== GameState.PLAYING) return;
    this.ball.prevY = this.ball.y;
    this.obstacles.snapshot();
    this.coins.snapshot();
    this.totalSteps++;

    const speed = difficultyAt(this.elapsed).speed;
    const maxV = Math.max(this.physics.maxFallSpeed, this.physics.maxRiseSpeed);
    const n = substepsFor((speed + maxV) * dt, this.ball.radius * PHYSICS.hitboxScale);
    const sub = dt / n;

    for (let i = 0; i < n; i++) {
      stepBall(this.ball, this.holding, sub, this.physics);
      this.obstacles.update(sub, this.elapsed);
      this.coins.update(speed * sub, sub);
      for (const c of this.coins.collect(this.ball.x, this.ball.y, this.ball.radius)) {
        this.emit({ type: 'coin', x: c.x, y: c.y, collected: this.coins.collected });
      }
      this.elapsed += sub;
      if (this.score.addTime(sub)) this.emit({ type: 'newRecord', score: this.score.score });

      const r = this.ball.radius * PHYSICS.hitboxScale;
      for (const b of this.obstacles.barriers) {
        if (ballHitsBarrier(this.ball.x, this.ball.y, r, b)) {
          this.crash();
          return;
        }
        if (!b.passed && b.x + b.width < this.ball.x - this.ball.radius) {
          b.passed = true;
          const record = this.score.addBarrier();
          this.emit({ type: 'pass', barrier: b, score: this.score.score });
          if (record) this.emit({ type: 'newRecord', score: this.score.score });
        }
      }
    }
  }

  private crash(): void {
    this.holding = false;
    // Salva o recorde já na batida (mesmo que o jogador feche a aba na tela de continuar).
    const result = this.score.finish();
    this.setState(this.livesLeft > 0 ? GameState.CONTINUE : GameState.GAME_OVER);
    this.emit({ type: 'crash', x: this.ball.x, y: this.ball.y, ...result, livesLeft: this.livesLeft });
  }
}
