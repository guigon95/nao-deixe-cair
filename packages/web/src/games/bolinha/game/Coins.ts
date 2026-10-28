import { COINS } from './config';
import type { Rng } from '../../../shared/random';
import type { Barrier } from './types';

export interface Coin {
  active: boolean;
  x: number;
  y: number;
  prevX: number;
  /** Fase da animação de giro (só visual). */
  spin: number;
}

/**
 * Moedas no percurso. Nascem entre duas barreiras, na metade do caminho
 * entre os dois vãos — o mesmo trajeto que a bolinha já precisa fazer —,
 * então pegar moeda nunca exige uma manobra impossível. Não afetam a
 * pontuação do ranking: são a moeda da loja.
 */
export class CoinField {
  readonly coins: Coin[] = [];
  /** Moedas pegas na partida atual. */
  collected = 0;

  constructor(private rng: Rng) {
    for (let i = 0; i < COINS.pool; i++) this.coins.push({ active: false, x: 0, y: 0, prevX: 0, spin: 0 });
  }

  reset(rng: Rng): void {
    this.rng = rng;
    this.collected = 0;
    for (const c of this.coins) c.active = false;
  }

  /** Chamado quando nasce uma barreira: às vezes põe uma moeda entre ela e a anterior. */
  onBarrier(prev: Barrier | undefined, next: Barrier, spawnedCount: number): void {
    if (!prev || spawnedCount <= COINS.skipFirst) return;
    if (this.rng() >= COINS.chance) return;
    const c = this.coins.find((c) => !c.active);
    if (!c) return;
    const gapPrev = (prev.gapTop + prev.gapBottom) / 2;
    const gapNext = (next.gapTop + next.gapBottom) / 2;
    c.active = true;
    c.x = c.prevX = (prev.x + prev.width + next.x) / 2;
    c.y = gapPrev + (gapNext - gapPrev) * 0.5;
    c.spin = this.rng() * Math.PI * 2;
  }

  snapshot(): void {
    for (const c of this.coins) if (c.active) c.prevX = c.x;
  }

  /** Move com o cenário e recicla as que saíram da tela. */
  update(dx: number, dt: number): void {
    for (const c of this.coins) {
      if (!c.active) continue;
      c.x -= dx;
      c.spin += dt * 5;
      if (c.x < -20) c.active = false;
    }
  }

  /** Pega as moedas que a bolinha tocou. Retorna quantas pegou agora. */
  collect(bx: number, by: number, radius: number): Coin[] {
    const got: Coin[] = [];
    const reach = radius + COINS.radius + COINS.magnet;
    for (const c of this.coins) {
      if (!c.active) continue;
      const dx = c.x - bx;
      const dy = c.y - by;
      if (dx * dx + dy * dy <= reach * reach) {
        c.active = false;
        this.collected++;
        got.push(c);
      }
    }
    return got;
  }

  /** Remove as moedas perto da bolinha (ao continuar depois de bater). */
  clearBefore(x: number): void {
    for (const c of this.coins) if (c.active && c.x < x) c.active = false;
  }
}
