import type { Dir } from './types';

/** Deslocamento mínimo (px CSS) para contar como deslize. Curto de propósito: gestos rápidos respondem. */
export const SWIPE_THRESHOLD = 16;

/** Direção dominante de um deslocamento, ou null se ainda for curto demais. */
export function swipeDir(dx: number, dy: number, threshold = SWIPE_THRESHOLD): Dir | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  // Exige um eixo claramente dominante (evita diagonais ambíguas virarem a curva errada).
  if (ax > ay * 1.15) return dx > 0 ? 'right' : 'left';
  if (ay > ax * 1.15) return dy > 0 ? 'down' : 'up';
  return null;
}

interface PointerTarget {
  addEventListener(type: string, fn: (e: PointerEvent) => void, opts?: AddEventListenerOptions): void;
  removeEventListener(type: string, fn: (e: PointerEvent) => void): void;
}

/**
 * Deslize em qualquer ponto da tela. A curva sai durante o movimento (não
 * espera tirar o dedo) e um mesmo gesto pode fazer várias curvas: depois de
 * cada uma, o ponto de partida passa a ser onde o dedo está — um "L" com o
 * dedo vira duas curvas.
 */
export class SwipeInput {
  private start: { x: number; y: number; id: number } | null = null;
  private enabled = true;

  constructor(
    private target: PointerTarget,
    private onDir: (d: Dir) => void,
    private threshold = SWIPE_THRESHOLD,
  ) {
    target.addEventListener('pointerdown', this.down, { passive: true });
    target.addEventListener('pointermove', this.move, { passive: true });
    target.addEventListener('pointerup', this.up);
    target.addEventListener('pointercancel', this.up);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.start = null;
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    if ((e.target as Element | null)?.closest?.('[data-ui]')) return;
    this.start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  private move = (e: PointerEvent) => {
    const s = this.start;
    if (!s || !this.enabled || e.pointerId !== s.id) return;
    const d = swipeDir(e.clientX - s.x, e.clientY - s.y, this.threshold);
    if (!d) return;
    this.onDir(d);
    this.start = { x: e.clientX, y: e.clientY, id: s.id };
  };

  private up = (e: PointerEvent) => {
    if (this.start && e.pointerId === this.start.id) this.start = null;
  };

  dispose() {
    this.target.removeEventListener('pointerdown', this.down);
    this.target.removeEventListener('pointermove', this.move);
    this.target.removeEventListener('pointerup', this.up);
    this.target.removeEventListener('pointercancel', this.up);
  }
}

/** Teclas → direção (setas e WASD). */
export function keyDir(code: string): Dir | null {
  switch (code) {
    case 'ArrowUp':
    case 'KeyW':
      return 'up';
    case 'ArrowDown':
    case 'KeyS':
      return 'down';
    case 'ArrowLeft':
    case 'KeyA':
      return 'left';
    case 'ArrowRight':
    case 'KeyD':
      return 'right';
    default:
      return null;
  }
}
