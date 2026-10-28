import { GROUND } from './config';
import { createRng } from '../../../shared/random';

/**
 * Relevo suave e determinístico: soma de três senoides com fases sorteadas
 * pela semente. A amplitude cresce com a distância (dificuldade) e é zero
 * no começo, para a decolagem ser tranquila. Consultar a altura é O(1).
 */
export class Terrain {
  private f = [1 / 260, 1 / 115, 1 / 52];
  private p = [0, 0, 0];
  private w = [0.58, 0.3, 0.12];

  constructor(seed = 1) {
    this.reseed(seed);
  }

  reseed(seed: number): void {
    const rng = createRng(seed ^ 0x9e3779b9);
    this.p = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
    this.f = [1 / (240 + rng() * 60), 1 / (100 + rng() * 30), 1 / (48 + rng() * 10)];
  }

  /** Amplitude do relevo em x (0 no início, cresce até o máximo). */
  amplitude(x: number): number {
    const ramp = Math.min(1, Math.max(0, (x - 600) / 1400));
    const level = Math.min(1, Math.max(0, x / 30000));
    return ramp * (GROUND.amplitudeStart + (GROUND.amplitudeMax - GROUND.amplitudeStart) * level);
  }

  /** Altura do chão em x (y para cima). */
  height(x: number): number {
    const a = this.amplitude(x);
    if (a === 0) return GROUND.base;
    return GROUND.base + a * (this.w[0] * Math.sin(x * this.f[0] + this.p[0]) + this.w[1] * Math.sin(x * this.f[1] + this.p[1]) + this.w[2] * Math.sin(x * this.f[2] + this.p[2]));
  }

  /** Inclinação do chão (rad) em x. */
  slope(x: number): number {
    const e = 2;
    return Math.atan2(this.height(x + e) - this.height(x - e), 2 * e);
  }

  /** Maior altura do chão no intervalo [x0, x1] (amostrado). */
  maxHeight(x0: number, x1: number, step = 12): number {
    let m = -Infinity;
    for (let x = x0; x <= x1; x += step) m = Math.max(m, this.height(x));
    return Math.max(m, this.height(x1));
  }
}
