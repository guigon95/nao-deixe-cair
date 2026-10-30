import { createRng, randomSeed, type Rng } from '../../../shared/random';
import type { Storage } from '../../../shared/storage/storage';
import {
  BONUS_CHANCE,
  GRID,
  ITEMS,
  ITEM_KINDS,
  MILESTONES,
  MULTIPLIER_TIME,
  SPEED,
  START_LENGTH,
  STORAGE,
  type ItemKind,
} from './config';
import { DELTA, GameState, OPPOSITE, type Cell, type CrashReason, type Dir, type EngineEvent, type Item } from './types';

/** Contagem antes de voltar da pausa (s). */
export const RESUME_TIME = 1.2;
/** Tempo máximo simulado por quadro (s): sem "espiral da morte" após travadas. */
const MAX_FRAME = 0.25;
/** Fila de curvas: permite "virar duas vezes" rápido (ex.: meia-volta em U). */
const QUEUE_MAX = 3;

export interface EngineOptions {
  storage: Storage;
  seed?: number;
  cols?: number;
  rows?: number;
}

/**
 * Simulação do Snake, independente do React e do Canvas.
 * Tudo em células inteiras; o tempo avança em passos de duração `interval`
 * (que encurta conforme a cobrinha come). A renderização usa `prev` e
 * `progress` para interpolar o movimento entre passos.
 */
export class Engine {
  readonly cols: number;
  readonly rows: number;
  state: GameState = GameState.READY;
  runId = 0;

  /** Corpo: índice 0 é a cabeça. */
  snake: Cell[] = [];
  /** Posição de cada segmento antes do último passo (mesmo tamanho de `snake`). */
  prev: Cell[] = [];
  /** Item que "recheia" cada segmento (null = terno liso). Índice 0 (cabeça) é sempre null. */
  fill: (ItemKind | null)[] = [];
  dir: Dir = 'up';
  /** Direção do último passo dado (a que vale para proibir a meia-volta). */
  movedDir: Dir = 'up';
  items: Item[] = [];

  score = 0;
  best = 0;
  eaten = 0;
  /** Pontos já recordes nesta partida (evento disparado uma vez). */
  private recordAnnounced = false;
  private bestAtStart = 0;
  multiplierTime = 0;
  /** Tempo de partida (s), sem contar pausas. */
  time = 0;
  /** Tempo acumulado desde o último passo (s). */
  stepTimer = 0;
  interval: number = SPEED.startStep;
  resumeCountdown = 0;
  /** Último item comido e há quanto tempo (animação da boca). */
  lastBite = 99;
  crashedAt: Cell | null = null;

  private queue: Dir[] = [];
  private pendingGrow: ItemKind[] = [];
  private nextItemId = 1;
  private rng: Rng;
  private listeners = new Set<(e: EngineEvent) => void>();
  private nextMilestone = 0;

  constructor(private opts: EngineOptions) {
    this.cols = opts.cols ?? GRID.cols;
    this.rows = opts.rows ?? GRID.rows;
    this.rng = createRng(opts.seed ?? randomSeed());
    this.best = readBest(opts.storage);
    this.layoutSnake();
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private setState(s: GameState) {
    if (s === this.state) return;
    const previous = this.state;
    this.state = s;
    this.emit({ type: 'state', state: s, previous });
  }

  get length() {
    return this.snake.length;
  }

  get multiplier() {
    return this.multiplierTime > 0 ? 2 : 1;
  }

  /** Fração (0–1) do passo atual já percorrida — para interpolar o desenho. */
  get progress() {
    if (this.state !== GameState.PLAYING) return this.state === GameState.GAME_OVER ? 0 : Math.min(1, this.stepTimer / this.interval);
    return Math.min(1, this.stepTimer / this.interval);
  }

  /** Cobrinha no centro, de pé, apontando para cima (tela em pé do celular). */
  private layoutSnake() {
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows * 0.62);
    this.snake = [];
    for (let i = 0; i < START_LENGTH; i++) this.snake.push({ x: cx, y: cy + i });
    this.prev = this.snake.map((c) => ({ ...c }));
    this.fill = this.snake.map(() => null);
    this.dir = this.movedDir = 'up';
  }

  start() {
    this.runId++;
    this.layoutSnake();
    this.items = [];
    this.queue = [];
    this.pendingGrow = [];
    this.score = 0;
    this.eaten = 0;
    this.time = 0;
    this.stepTimer = 0;
    this.multiplierTime = 0;
    this.interval = SPEED.startStep;
    this.lastBite = 99;
    this.crashedAt = null;
    this.recordAnnounced = false;
    this.bestAtStart = this.best;
    this.nextMilestone = 0;
    this.spawn(this.pickKind(false));
    this.setState(GameState.PLAYING);
  }

  pause() {
    if (this.state === GameState.PLAYING || this.state === GameState.RESUMING) {
      this.queue = [];
      this.setState(GameState.PAUSED);
    }
  }

  resume() {
    if (this.state !== GameState.PAUSED) return;
    this.resumeCountdown = RESUME_TIME;
    this.setState(GameState.RESUMING);
  }

  toMenu() {
    this.layoutSnake();
    this.items = [];
    this.crashedAt = null;
    this.setState(GameState.READY);
  }

  /** Recorde da conta (servidor) também vale neste aparelho: só sobe. */
  raiseBest(n: number): boolean {
    if (n <= this.best) return false;
    this.best = n;
    writeBest(this.opts.storage, n);
    return true;
  }

  /**
   * Pede uma curva. Meia-volta direta (que seria batida garantida) e repetir a
   * direção atual são ignoradas. A comparação é feita com a última curva da
   * fila, então "cima, esquerda" rápido vira um U sem bater.
   */
  turn(d: Dir): boolean {
    if (this.state !== GameState.PLAYING && this.state !== GameState.RESUMING) return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.movedDir;
    if (d === last || d === OPPOSITE[last]) return false;
    if (this.queue.length >= QUEUE_MAX) return false;
    this.queue.push(d);
    this.emit({ type: 'turn', dir: d });
    // Resposta imediata: se mais da metade do passo já passou, anda agora em vez de esperar.
    if (this.state === GameState.PLAYING && this.queue.length === 1 && this.stepTimer >= this.interval * 0.5) {
      this.stepTimer = 0;
      this.step();
    }
    return true;
  }

  advance(dtRaw: number) {
    const dt = Math.min(Math.max(0, dtRaw), MAX_FRAME);
    if (this.state === GameState.RESUMING) {
      this.resumeCountdown -= dt;
      if (this.resumeCountdown <= 0) {
        this.resumeCountdown = 0;
        this.setState(GameState.PLAYING);
      }
      return;
    }
    if (this.state !== GameState.PLAYING) return;

    this.time += dt;
    this.lastBite += dt;
    if (this.multiplierTime > 0) {
      this.multiplierTime = Math.max(0, this.multiplierTime - dt);
      if (this.multiplierTime === 0) this.emit({ type: 'multiplier', on: false });
    }
    for (const it of this.items) it.age += dt;
    const expired = this.items.filter((it) => it.life > 0 && it.age >= it.life);
    if (expired.length) {
      this.items = this.items.filter((it) => !expired.includes(it));
      for (const it of expired) this.emit({ type: 'expire', item: it });
    }

    this.stepTimer += dt;
    while (this.state === GameState.PLAYING && this.stepTimer >= this.interval) {
      this.stepTimer -= this.interval;
      this.step();
    }
  }

  /** Um passo de grade. Público para os testes. */
  step() {
    if (this.state !== GameState.PLAYING) return;
    const next = this.queue.shift();
    if (next) this.dir = next;
    const d = DELTA[this.dir];
    const head = this.snake[0];
    const nh = { x: head.x + d.x, y: head.y + d.y };

    if (nh.x < 0 || nh.y < 0 || nh.x >= this.cols || nh.y >= this.rows) return this.crash('wall', nh);
    const growing = this.pendingGrow.length > 0;
    // Sem crescer, a ponta do rabo sai do lugar neste mesmo passo: dá para "perseguir o rabo".
    const body = growing ? this.snake : this.snake.slice(0, -1);
    if (body.some((c) => c.x === nh.x && c.y === nh.y)) return this.crash('self', nh);

    const old = this.snake;
    this.snake = [nh, ...old];
    this.fill = [null, ...this.fill];
    if (growing) {
      const kind = this.pendingGrow.shift()!;
      this.fill[1] = kind;
      // o "recheio" mais recente fica logo atrás da cabeça; os antigos vão para trás
    } else {
      this.snake.pop();
      this.fill.pop();
    }
    this.prev = this.snake.map((_, i) => (i < old.length ? { ...old[i] } : { ...old[old.length - 1] }));
    this.movedDir = this.dir;

    const hit = this.items.find((it) => it.x === nh.x && it.y === nh.y);
    if (hit) this.eat(hit);
  }

  private eat(it: Item) {
    const spec = ITEMS[it.kind];
    this.items = this.items.filter((x) => x !== it);
    if (it.kind === 'mala') {
      const was = this.multiplierTime > 0;
      this.multiplierTime = MULTIPLIER_TIME;
      if (!was) this.emit({ type: 'multiplier', on: true });
    }
    const mult = it.kind === 'mala' ? 1 : this.multiplier;
    const points = spec.points * mult;
    this.score += points;
    this.eaten++;
    this.lastBite = 0;
    for (let i = 0; i < spec.grow; i++) this.pendingGrow.push(it.kind);
    this.interval = Math.max(SPEED.minStep, SPEED.startStep - this.eaten * SPEED.perItem);
    const finalLength = this.snake.length + this.pendingGrow.length;
    this.emit({ type: 'eat', item: it, points, multiplier: mult, length: finalLength });

    if (!this.recordAnnounced && this.bestAtStart > 0 && this.score > this.bestAtStart) {
      this.recordAnnounced = true;
      this.emit({ type: 'newRecord', score: this.score });
    }
    while (this.nextMilestone < MILESTONES.length && finalLength >= MILESTONES[this.nextMilestone]) {
      this.emit({ type: 'milestone', length: MILESTONES[this.nextMilestone] });
      this.nextMilestone++;
    }

    // Sempre há exatamente um item comum na mesa; raros aparecem de vez em quando.
    if (spec.life === 0) {
      this.spawn(this.pickKind(false));
      const hasRare = this.items.some((x) => x.life > 0);
      if (!hasRare && this.rng() < BONUS_CHANCE) {
        const rare = this.pickKind(true);
        if (rare) this.spawn(rare);
      }
    }
  }

  /** Sorteio ponderado entre os itens liberados pelo tamanho atual. */
  pickKind(rare: boolean): ItemKind | null {
    const len = this.snake.length;
    const pool = ITEM_KINDS.filter((k) => (ITEMS[k].life > 0) === rare && len >= ITEMS[k].minLength);
    if (!pool.length) return null;
    const total = pool.reduce((s, k) => s + ITEMS[k].weight, 0);
    let r = this.rng() * total;
    for (const k of pool) {
      r -= ITEMS[k].weight;
      if (r < 0) return k;
    }
    return pool[pool.length - 1];
  }

  /** Coloca um item numa célula livre (fora do corpo, de outros itens e da frente imediata da cabeça). */
  spawn(kind: ItemKind | null): Item | null {
    if (!kind) return null;
    const head = this.snake[0];
    const d = DELTA[this.dir];
    const ahead = { x: head.x + d.x, y: head.y + d.y };
    const busy = new Set<number>();
    const key = (x: number, y: number) => y * this.cols + x;
    for (const c of this.snake) busy.add(key(c.x, c.y));
    for (const it of this.items) busy.add(key(it.x, it.y));
    busy.add(key(ahead.x, ahead.y));
    const free = this.cols * this.rows - busy.size;
    if (free <= 0) return null;
    let pick = Math.floor(this.rng() * free);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (busy.has(key(x, y))) continue;
        if (pick-- === 0) {
          const spec = ITEMS[kind];
          const item: Item = { id: this.nextItemId++, kind, x, y, age: 0, life: spec.life };
          this.items.push(item);
          this.emit({ type: 'spawn', item });
          return item;
        }
      }
    }
    return null;
  }

  private crash(reason: CrashReason, at: Cell) {
    this.crashedAt = at;
    this.queue = [];
    const isNewRecord = this.score > this.bestAtStart && this.score > 0;
    if (this.score > this.best) {
      this.best = this.score;
      writeBest(this.opts.storage, this.best);
    }
    // a cabeça fica parada onde estava (sem interpolar para dentro da parede)
    this.prev = this.snake.map((c) => ({ ...c }));
    this.stepTimer = 0;
    this.setState(GameState.GAME_OVER);
    this.emit({ type: 'crash', reason, x: at.x, y: at.y, score: this.score, best: this.best, isNewRecord, length: this.snake.length });
  }
}

export function readBest(storage: Storage): number {
  try {
    const n = Number.parseInt(storage.getItem(STORAGE.best) ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeBest(storage: Storage, n: number) {
  try {
    storage.setItem(STORAGE.best, String(n));
  } catch {
    /* sem armazenamento: o recorde vale só nesta sessão */
  }
}
