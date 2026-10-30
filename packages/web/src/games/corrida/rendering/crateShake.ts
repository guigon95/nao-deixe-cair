import type { Crate } from '../game/types';

/**
 * Caixote com montaria dentro: dá "trancos" de tempos em tempos, como se o
 * bicho quisesse sair. O mesmo relógio decide o desenho (Renderer) e o som
 * abafado do animal (hook), para os dois baterem juntos.
 */
export const CRATE_SHAKE = {
  /** Intervalo entre trancos (s) e quanto de cada ciclo é tranco. */
  period: 1.7,
  burst: 0.32,
} as const;

/** Fase 0..1 do ciclo deste caixote (cada caixote num ritmo um pouco diferente). */
export function crateShakePhase(c: Crate, time: number): number {
  const p = (time / CRATE_SHAKE.period + c.x0 * 0.0037) % 1;
  return p < 0 ? p + 1 : p;
}

/** Inclinação (rad) e pulinho (u) do caixote neste instante. */
export function crateShake(c: Crate, time: number): { angle: number; hop: number } {
  const ph = crateShakePhase(c, time);
  if (ph > CRATE_SHAKE.burst) return { angle: 0, hop: 0 };
  const k = ph / CRATE_SHAKE.burst;
  const env = Math.sin(k * Math.PI);
  return { angle: Math.sin(k * Math.PI * 6) * 0.13 * env, hop: Math.abs(Math.sin(k * Math.PI * 3)) * 3.5 * env };
}
