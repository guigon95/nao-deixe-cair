import type { GameId } from './games';

/**
 * Catálogo da loja no servidor (fonte da verdade dos preços). Deve bater com
 * packages/web/src/games/bolinha/game/cosmetics.ts — um teste confere.
 */
export interface CatalogItem {
  id: string;
  kind: 'skin' | 'trail';
  price: number;
}

export const CATALOG: Record<GameId, readonly CatalogItem[]> = {
  bolinha: [
    { id: 'classica', kind: 'skin', price: 0 },
    { id: 'basquete', kind: 'skin', price: 25 },
    { id: 'sorriso', kind: 'skin', price: 40 },
    { id: 'futebol', kind: 'skin', price: 60 },
    { id: 'gelo', kind: 'skin', price: 90 },
    { id: 'planeta', kind: 'skin', price: 120 },
    { id: 'lava', kind: 'skin', price: 150 },
    { id: 'padrao', kind: 'trail', price: 0 },
    { id: 'bolhas', kind: 'trail', price: 20 },
    { id: 'arco-iris', kind: 'trail', price: 45 },
    { id: 'estrelas', kind: 'trail', price: 70 },
    { id: 'fogo', kind: 'trail', price: 100 },
  ],
  aviao: [],
};

export const DEFAULT_SKIN = 'classica';
export const DEFAULT_TRAIL = 'padrao';

export const freeItems = (game: GameId) => CATALOG[game].filter((i) => i.price === 0).map((i) => i.id);
export const findItem = (game: GameId, id: string) => CATALOG[game].find((i) => i.id === id);

/**
 * Teto de moedas por partida (anti-trapaça simples): no máximo ~1 barreira
 * por segundo e só parte delas tem moeda. Generoso de propósito.
 */
export const maxCoinsFor = (durationMs: number) => Math.floor(durationMs / 1000) + 3;

/** Moedas trazidas deste aparelho na primeira vez que a conta entra (uma vez só). */
export const IMPORT_MAX_COINS = 2000;
