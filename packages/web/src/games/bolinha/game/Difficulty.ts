import type { DifficultyParams } from './types';

/**
 * Curva de dificuldade em função do tempo de partida (s).
 *
 * Usa uma curva de saturação exponencial: cresce rápido no começo
 * (o jogador sente a evolução) e se aproxima suavemente de um teto
 * (sem picos injustos nem dificuldade infinita).
 */
export const DIFFICULTY_CURVE = {
  /** Constante de tempo (s): em ~τ a dificuldade chega a 63% do teto. */
  tau: 70,
  speed: { start: 150, end: 285 },
  spacing: { start: 245, end: 190 },
  gap: { start: 200, end: 124 },
  maxShift: { start: 110, end: 330 },
  /** Período sem nenhuma variação de altura no início (aquecimento). */
  warmupBarriers: 2,
} as const;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function difficultyLevel(elapsed: number): number {
  if (!(elapsed > 0)) return 0;
  return 1 - Math.exp(-elapsed / DIFFICULTY_CURVE.tau);
}

export function difficultyAt(elapsed: number): DifficultyParams {
  const level = difficultyLevel(elapsed);
  const c = DIFFICULTY_CURVE;
  return {
    level,
    speed: lerp(c.speed.start, c.speed.end, level),
    spacing: lerp(c.spacing.start, c.spacing.end, level),
    gap: lerp(c.gap.start, c.gap.end, level),
    maxShift: lerp(c.maxShift.start, c.maxShift.end, level),
  };
}
