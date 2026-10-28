import { ballBounds, PHYSICS } from './config';
import type { Ball } from './types';

export interface PhysicsParams {
  gravity: number;
  thrust: number;
  reversalBoost: number;
  maxRiseSpeed: number;
  maxFallSpeed: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  gravity: PHYSICS.gravity,
  thrust: PHYSICS.thrust,
  reversalBoost: PHYSICS.reversalBoost,
  maxRiseSpeed: PHYSICS.maxRiseSpeed,
  maxFallSpeed: PHYSICS.maxFallSpeed,
};

/**
 * Aceleração vertical resultante (u/s², positivo = para baixo).
 *
 * - Pressionado: gravidade − propulsão (líquido para cima).
 * - Solto: só gravidade.
 * - Se a força atua contra o movimento atual, ela recebe `reversalBoost`.
 *   Isso encurta o tempo de inversão de direção — a principal causa de
 *   “controle borrachudo” neste gênero — sem aumentar a velocidade máxima.
 */
export function verticalAcceleration(vy: number, holding: boolean, p: PhysicsParams = DEFAULT_PHYSICS): number {
  if (holding) {
    const boost = vy > 0 ? p.reversalBoost : 1;
    return p.gravity - p.thrust * boost;
  }
  const boost = vy < 0 ? p.reversalBoost : 1;
  return p.gravity * boost;
}

/**
 * Avança a bolinha por `dt` segundos (Euler semi-implícito: velocidade
 * primeiro, depois posição — estável e barato para passos fixos curtos).
 */
export function stepBall(ball: Ball, holding: boolean, dt: number, p: PhysicsParams = DEFAULT_PHYSICS): void {
  const ay = verticalAcceleration(ball.vy, holding, p);
  ball.vy += ay * dt;
  if (ball.vy < -p.maxRiseSpeed) ball.vy = -p.maxRiseSpeed;
  if (ball.vy > p.maxFallSpeed) ball.vy = p.maxFallSpeed;

  ball.y += ball.vy * dt;

  const { minY, maxY } = ballBounds(ball.radius);
  if (ball.y < minY) {
    ball.y = minY;
    if (ball.vy < 0) ball.vy = 0; // anula só a componente que levaria para fora
  } else if (ball.y > maxY) {
    ball.y = maxY;
    if (ball.vy > 0) ball.vy = 0;
  }
}

/**
 * Maior deslocamento vertical (u) que a bolinha consegue fazer em `time`
 * segundos partindo do repouso, empurrando sempre na mesma direção.
 * Simulado com a mesma integração do jogo, sem limites de arena.
 * Usado pelo gerador para rejeitar sequências fisicamente impossíveis.
 */
export function reachableDistance(time: number, direction: 'up' | 'down', p: PhysicsParams = DEFAULT_PHYSICS): number {
  if (time <= 0) return 0;
  const dt = PHYSICS.fixedDt;
  let vy = 0;
  let y = 0;
  const holding = direction === 'up';
  for (let t = 0; t < time; t += dt) {
    vy += verticalAcceleration(vy, holding, p) * dt;
    if (vy < -p.maxRiseSpeed) vy = -p.maxRiseSpeed;
    if (vy > p.maxFallSpeed) vy = p.maxFallSpeed;
    y += vy * dt;
  }
  return Math.abs(y);
}
