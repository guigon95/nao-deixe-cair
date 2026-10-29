import { SPEED } from './config';

/**
 * Curva de dificuldade. Tudo em função do tempo de partida (s), num lugar só:
 * - a velocidade sobe rápido no começo e se aproxima do máximo devagar;
 * - "nível" libera padrões de obstáculos novos aos poucos (não tudo de uma vez);
 * - a folga entre padrões diminui até um mínimo que ainda dá tempo de reagir.
 *
 * Referência de projeto (ajustável):
 *   0–10 s   nível 0: pedras, caixotes e riachos isolados, bastante espaço
 *   10–25 s  nível 1: galhos, flores-mola, espinhos, rios médios
 *   25–45 s  nível 2: combinações (pedra + rio, ponte de galho, rio largo)
 *   45–75 s  nível 3: escadas de galhos, espinhos longos, sequências
 *   75 s +   nível 4: as combinações mais exigentes, folga mínima
 */

export const TIER_TIMES = [0, 10, 25, 45, 75] as const;

export function speedAt(t: number): number {
  const s = SPEED.start + (SPEED.max - SPEED.start) * (1 - Math.exp(-Math.max(0, t) / SPEED.tau));
  return Math.min(SPEED.max, s);
}

export function tierAt(t: number): number {
  let tier = 0;
  for (let i = 0; i < TIER_TIMES.length; i++) if (t >= TIER_TIMES[i]) tier = i;
  return tier;
}

/** Folga extra (s) entre o fim de um padrão (já com o pouso) e o próximo. */
export function restAt(t: number): { min: number; max: number } {
  const k = Math.min(1, Math.max(0, t) / 90);
  return { min: 0.85 - 0.6 * k, max: 1.45 - 0.85 * k };
}

/** Chance de um padrão vir "espelhado" com capins arriscados extras. */
export function riskyFruitChance(t: number): number {
  return Math.min(0.6, 0.15 + t / 200);
}

export interface Difficulty {
  speed: number;
  tier: number;
  rest: { min: number; max: number };
}

export function difficultyAt(t: number): Difficulty {
  return { speed: speedAt(t), tier: tierAt(t), rest: restAt(t) };
}
