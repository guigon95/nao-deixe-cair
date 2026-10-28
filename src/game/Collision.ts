import { ARENA } from './config';
import type { Barrier } from './types';

/** Interseção círculo × retângulo alinhado aos eixos (ponto mais próximo). */
export function circleIntersectsRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  if (rw <= 0 || rh <= 0) return false;
  const nx = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
  const ny = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * Colisão da bolinha (raio considerado, não apenas o centro) com as duas
 * partes de uma barreira. As partes vão da borda da arena até o vão.
 */
export function ballHitsBarrier(cx: number, cy: number, r: number, b: Barrier): boolean {
  // Descarte rápido no eixo X.
  if (cx + r <= b.x || cx - r >= b.x + b.width) return false;
  return (
    circleIntersectsRect(cx, cy, r, b.x, -ARENA.height, b.width, b.gapTop + ARENA.height) ||
    circleIntersectsRect(cx, cy, r, b.x, b.gapBottom, b.width, ARENA.height * 2 - b.gapBottom)
  );
}

/**
 * Quantos subpassos são necessários para que nenhum objeto avance mais que
 * metade do raio por subpasso — garante que a bolinha não “atravesse” uma
 * barreira entre duas verificações (prevenção de tunelamento).
 */
export function substepsFor(maxDisplacement: number, radius: number): number {
  const limit = Math.max(radius * 0.5, 0.0001);
  return Math.max(1, Math.ceil(maxDisplacement / limit));
}
