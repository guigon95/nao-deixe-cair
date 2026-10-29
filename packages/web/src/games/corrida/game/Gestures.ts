/**
 * Reconhece os deslizes do toque (o toque em si já pula, na hora — sem
 * esperar para saber se é deslize, o pulo nunca fica atrasado):
 * - deslizar para BAIXO = descer rápido / atravessar o galho;
 * - deslizar para a DIREITA = dash (se o medidor estiver cheio).
 * Um gesto dispara no máximo uma ação. Distâncias em pixels CSS.
 */
export type Swipe = 'drop' | 'dash';

export const SWIPE = {
  /** Distância mínima (px). */
  minDistance: 34,
  /** Tempo máximo desde o toque (s): deslize lento não conta. */
  maxTime: 0.35,
  /** O eixo principal precisa dominar o outro nesta proporção. */
  dominance: 1.3,
} as const;

interface Track {
  x: number;
  y: number;
  t: number;
  done: boolean;
}

export class SwipeDetector {
  private tracks = new Map<number, Track>();

  down(id: number, x: number, y: number, t: number): void {
    this.tracks.set(id, { x, y, t, done: false });
  }

  move(id: number, x: number, y: number, t: number): Swipe | null {
    const tr = this.tracks.get(id);
    if (!tr || tr.done) return null;
    if (t - tr.t > SWIPE.maxTime) {
      tr.done = true;
      return null;
    }
    const dx = x - tr.x;
    const dy = y - tr.y; // tela: y para baixo
    if (dy > SWIPE.minDistance && dy > Math.abs(dx) * SWIPE.dominance) {
      tr.done = true;
      return 'drop';
    }
    if (dx > SWIPE.minDistance && dx > Math.abs(dy) * SWIPE.dominance) {
      tr.done = true;
      return 'dash';
    }
    return null;
  }

  up(id: number): void {
    this.tracks.delete(id);
  }

  clear(): void {
    this.tracks.clear();
  }
}
