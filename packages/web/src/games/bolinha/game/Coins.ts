import { ballBounds, COINS, OBSTACLES } from './config';
import { reachableDistance } from './Physics';
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
 * Moedas no percurso. Nascem entre duas barreiras, deslocadas para cima ou
 * para baixo da linha entre os dois vãos: pegar exige sair do caminho mais
 * seguro, mas o desvio é limitado pela física (dá para pegar e ainda chegar
 * ao próximo vão). Não afetam a pontuação do ranking: são a moeda da loja.
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
  onBarrier(prev: Barrier | undefined, next: Barrier, spawnedCount: number, speed = 160): void {
    if (!prev || spawnedCount <= COINS.skipFirst) return;
    if (this.rng() >= COINS.chance) return;
    const c = this.coins.find((c) => !c.active);
    if (!c) return;
    const gapPrev = (prev.gapTop + prev.gapBottom) / 2;
    const gapNext = (next.gapTop + next.gapBottom) / 2;
    const x = (prev.x + prev.width + next.x) / 2;
    const mid = (gapPrev + gapNext) / 2;
    // Tempo da saída do vão anterior até a moeda (e da moeda ao próximo vão).
    const half = Math.max(0, (next.x - prev.x - prev.width) / 2 / speed - OBSTACLES.reactionTime * 0.5);
    const dir = this.rng() < 0.5 ? -1 : 1; // -1 = acima (segurar), 1 = abaixo (soltar)
    const room = reachableDistance(half, dir < 0 ? 'up' : 'down') * COINS.offsetSafety;
    const want = COINS.offsetMin + this.rng() * (COINS.offsetMax - COINS.offsetMin);
    const { minY, maxY } = ballBounds(COINS.radius);
    c.active = true;
    c.x = c.prevX = x;
    c.y = Math.min(maxY, Math.max(minY, mid + dir * Math.min(want, room)));
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
