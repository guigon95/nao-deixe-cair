import { ARENA, BALL_X, OBSTACLES, PHYSICS, playfield } from './config';
import { difficultyAt, DIFFICULTY_CURVE } from './Difficulty';
import { reachableDistance } from './Physics';
import { randRange, type Rng } from '../../../shared/random';
import type { Barrier, DifficultyParams } from './types';

type PatternKind = 'breather' | 'wander' | 'stairs' | 'zigzag' | 'tunnel';

interface PatternStep {
  kind: PatternKind;
  /** Deslocamento pretendido como fração de `maxShift` (com sinal); `null` = aleatório a cada tentativa. */
  shift: number | null;
  /** Multiplicador do espaçamento horizontal. */
  spacingFactor: number;
  /** Multiplicador da altura do vão. */
  gapFactor: number;
}

/** Margem à direita da arena onde as barreiras nascem (fora da tela). */
export const SPAWN_X = ARENA.width + 24;

/**
 * Deslocamento vertical máximo (centro a centro) que se pode exigir entre
 * duas barreiras consecutivas, dado o espaçamento e a velocidade.
 *
 * Tempo disponível = da saída da bolinha da barreira anterior até sua
 * entrada na próxima, menos o tempo de reação; o resultado é multiplicado
 * pela margem de segurança do gerador.
 */
export function maxFeasibleShift(spacing: number, speed: number, direction: 'up' | 'down'): number {
  const travel = spacing - OBSTACLES.width - 2 * PHYSICS.ballRadius;
  // +8% de velocidade: a dificuldade sobe enquanto a barreira atravessa a tela.
  const time = travel / (speed * 1.08) - OBSTACLES.reactionTime;
  return reachableDistance(time, direction) * OBSTACLES.feasibilitySafety;
}

export function gapCenterRange(gap: number) {
  const { top, bottom } = playfield();
  const half = gap / 2 + OBSTACLES.gapEdgePadding;
  return { min: top + half, max: bottom - half };
}

export interface GeneratedSpec {
  center: number;
  gap: number;
  spacing: number;
}

/**
 * Cria, move, valida e recicla barreiras.
 * Os padrões são escolhidos por pesos que dependem da dificuldade, e cada
 * barreira candidata passa por validação física antes de entrar na arena.
 */
export class ObstacleManager {
  readonly barriers: Barrier[] = [];
  private readonly pool: Barrier[] = [];
  private queue: PatternStep[] = [];
  private nextId = 1;
  private spawned = 0;
  private lastCenter = (playfield().top + playfield().bottom) / 2;
  private lastGap: number = DIFFICULTY_CURVE.gap.start;
  /** Estatística para testes: quantos candidatos foram rejeitados. */
  rejected = 0;
  /** Estatística: quantos deslocamentos foram reduzidos ao limite físico. */
  clamped = 0;

  /** Avisado a cada barreira nova (ex.: para pôr moedas entre barreiras). */
  onSpawn: ((prev: Barrier | undefined, next: Barrier, spawned: number) => void) | null = null;

  constructor(private rng: Rng) {}

  reset(rng: Rng): void {
    this.rng = rng;
    while (this.barriers.length) this.pool.push(this.barriers.pop()!);
    this.queue = [];
    this.nextId = 1;
    this.spawned = 0;
    this.lastCenter = (playfield().top + playfield().bottom) / 2;
    this.lastGap = DIFFICULTY_CURVE.gap.start;
    this.rejected = 0;
    this.clamped = 0;
  }

  /** Guarda as posições atuais para interpolação (chamado uma vez por passo fixo). */
  snapshot(): void {
    for (const b of this.barriers) b.prevX = b.x;
  }

  /** Move as barreiras, recicla as que saíram e gera novas quando há espaço. */
  update(dt: number, elapsed: number): void {
    const diff = difficultyAt(elapsed);
    const dx = diff.speed * dt;
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      const b = this.barriers[i];
      b.x -= dx;
      if (b.passed) b.passGlow += dt;
      if (b.x + b.width < -16) {
        this.barriers.splice(i, 1);
        this.pool.push(b);
      }
    }
    this.fill(diff);
  }

  /**
   * Abre espaço para continuar depois de uma batida: tira as barreiras que
   * estão em cima ou logo à frente da bolinha. Retorna o centro do vão da
   * próxima barreira que ficou (para posicionar a bolinha alinhada a ele).
   */
  clearAround(ballX: number, ahead: number): number {
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      const b = this.barriers[i];
      if (b.x < ballX + ahead) {
        this.barriers.splice(i, 1);
        this.pool.push(b);
      }
    }
    const next = this.barriers[0];
    return next ? (next.gapTop + next.gapBottom) / 2 : this.lastCenter;
  }

  /** Gera barreiras até a próxima ficar fora da tela, à direita. */
  fill(diff: DifficultyParams): void {
    for (let guard = 0; guard < 4; guard++) {
      const last = this.barriers[this.barriers.length - 1];
      if (!last) {
        this.spawn(SPAWN_X, diff);
        continue;
      }
      const spec = this.peekSpacing(diff);
      if (last.x + spec > SPAWN_X) return;
      this.spawn(last.x + spec, diff);
    }
  }

  private peekSpacing(diff: DifficultyParams): number {
    if (this.queue.length === 0) this.queue = this.buildPattern(diff);
    return diff.spacing * this.queue[0].spacingFactor;
  }

  private spawn(x: number, diff: DifficultyParams): void {
    if (this.queue.length === 0) this.queue = this.buildPattern(diff);
    const step = this.queue.shift()!;
    const spacing = this.barriers.length ? diff.spacing * step.spacingFactor : diff.spacing;
    const spec = this.generate(step, diff, spacing);

    const prev = this.barriers[this.barriers.length - 1];
    const b = this.pool.pop() ?? ({} as Barrier);
    b.id = this.nextId++;
    b.x = Math.max(x, BALL_X + OBSTACLES.minSpawnDistanceFromBall);
    b.prevX = b.x;
    b.width = OBSTACLES.width;
    b.gapTop = spec.center - spec.gap / 2;
    b.gapBottom = spec.center + spec.gap / 2;
    b.passed = false;
    b.passGlow = 0;
    this.barriers.push(b);

    this.lastCenter = spec.center;
    this.lastGap = spec.gap;
    this.spawned++;
    this.onSpawn?.(prev, b, this.spawned);
  }

  /** Gera e valida um vão; tentativas inviáveis são descartadas. */
  generate(step: PatternStep, diff: DifficultyParams, spacing: number): GeneratedSpec {
    const gap = Math.max(OBSTACLES.absoluteMinGap, diff.gap * step.gapFactor);
    const range = gapCenterRange(gap);

    if (this.spawned < DIFFICULTY_CURVE.warmupBarriers) {
      return { center: clamp(this.lastCenter, range.min, range.max), gap, spacing };
    }

    const r = PHYSICS.ballRadius;
    const slack = (Math.max(0, this.lastGap / 2 - r) + Math.max(0, gap / 2 - r)) * 0.5;
    const limitUp = maxFeasibleShift(spacing, diff.speed, 'up') + slack;
    const limitDown = maxFeasibleShift(spacing, diff.speed, 'down') + slack;

    for (let attempt = 0; attempt < OBSTACLES.maxGenerationAttempts; attempt++) {
      const frac = step.shift ?? randRange(this.rng, -1, 1);
      let dy = frac * diff.maxShift;
      // Padrões que bateriam na borda “refletem” em vez de grudar no limite.
      if (this.lastCenter + dy < range.min || this.lastCenter + dy > range.max) dy = -dy;
      // Nunca pede mais do que a física permite no tempo disponível.
      if (dy < -limitUp * 0.999) {
        dy = -limitUp * 0.999;
        this.clamped++;
      } else if (dy > limitDown * 0.999) {
        dy = limitDown * 0.999;
        this.clamped++;
      }
      const candidate = { center: clamp(this.lastCenter + dy, range.min, range.max), gap, spacing };
      if (this.isFeasible(candidate, diff.speed)) return candidate;
      this.rejected++;
      if (step.shift !== null) step.shift *= 0.75; // suaviza o padrão e tenta de novo
    }

    // Fallback garantido: mantém a altura do vão anterior (deslocamento ~0, sempre viável).
    return { center: clamp(this.lastCenter, range.min, range.max), gap, spacing };
  }

  /** Verifica se a transição do vão anterior para o candidato é fisicamente possível. */
  isFeasible(spec: GeneratedSpec, speed: number): boolean {
    if (!Number.isFinite(spec.center) || !Number.isFinite(spec.gap)) return false;
    if (spec.gap < OBSTACLES.absoluteMinGap) return false;
    const range = gapCenterRange(spec.gap);
    if (spec.center < range.min - 1e-6 || spec.center > range.max + 1e-6) return false;
    if (spec.spacing < OBSTACLES.width + 4 * PHYSICS.ballRadius) return false;
    const dy = spec.center - this.lastCenter;
    if (dy === 0) return true;
    // Folga: a bolinha não precisa ir de centro a centro — basta sair de um vão e entrar no outro.
    // Usamos só metade dessa folga para continuar conservador.
    const r = PHYSICS.ballRadius;
    const slack = Math.max(0, this.lastGap / 2 - r) + Math.max(0, spec.gap / 2 - r);
    const need = Math.max(0, Math.abs(dy) - slack * 0.5);
    return need <= maxFeasibleShift(spec.spacing, speed, dy < 0 ? 'up' : 'down');
  }

  private buildPattern(diff: DifficultyParams): PatternStep[] {
    const level = diff.level;
    const weights: Array<[PatternKind, number]> = [
      ['breather', 1.2 - level * 0.6],
      ['wander', 3],
      ['stairs', level > 0.12 ? 1.5 : 0],
      ['zigzag', level > 0.25 ? 1.2 + level : 0],
      ['tunnel', level > 0.4 ? 1 + level : 0],
    ];
    const total = weights.reduce((s, [, w]) => s + Math.max(0, w), 0);
    let pick = this.rng() * total;
    let kind: PatternKind = 'wander';
    for (const [k, w] of weights) {
      pick -= Math.max(0, w);
      if (pick <= 0) {
        kind = k;
        break;
      }
    }

    const n = (min: number, max: number) => min + Math.floor(this.rng() * (max - min + 1));
    const steps: PatternStep[] = [];
    switch (kind) {
      case 'breather':
        steps.push({ kind, shift: randRange(this.rng, -0.3, 0.3), spacingFactor: 1.15, gapFactor: 1.15 });
        break;
      case 'wander': {
        const count = n(2, 4);
        for (let i = 0; i < count; i++) steps.push({ kind, shift: null, spacingFactor: 1, gapFactor: 1 });
        break;
      }
      case 'stairs': {
        const sign = this.rng() < 0.5 ? -1 : 1;
        const count = n(3, 4);
        for (let i = 0; i < count; i++)
          steps.push({ kind, shift: sign * randRange(this.rng, 0.35, 0.55), spacingFactor: 0.95, gapFactor: 1 });
        break;
      }
      case 'zigzag': {
        let sign = this.rng() < 0.5 ? -1 : 1;
        const count = n(3, 5);
        for (let i = 0; i < count; i++) {
          steps.push({ kind, shift: sign * randRange(this.rng, 0.6, 0.95), spacingFactor: 1.05, gapFactor: 1.05 });
          sign = -sign;
        }
        break;
      }
      case 'tunnel': {
        const count = n(3, 5);
        for (let i = 0; i < count; i++)
          steps.push({ kind, shift: randRange(this.rng, -0.18, 0.18), spacingFactor: 0.72, gapFactor: 0.97 });
        // Respiro depois de um padrão exigente.
        steps.push({ kind: 'breather', shift: 0, spacingFactor: 1.2, gapFactor: 1.1 });
        break;
      }
    }
    return steps;
  }
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}
