import { gameKey, type GameId } from './storage/keys';
import type { Storage } from './storage/storage';

export interface GameInfo {
  id: GameId;
  /** Nome exibido no hub (provisório até a escolha definitiva). */
  name: string;
  /** Uma linha: como se joga. */
  tagline: string;
  /** Caminho relativo à raiz do hub. */
  href: string;
  /** Cor de destaque do cartão. */
  accent: string;
}

/** Catálogo do hub. Para adicionar um jogo: uma entrada aqui + uma pasta + um HTML no vite.config. */
export const GAMES: readonly GameInfo[] = [
  {
    id: 'corrida',
    name: 'Disparada',
    tagline: 'A capivara corre comendo capim. Pule o jacaré e fuja dos marimbondos.',
    href: 'corrida/',
    accent: '#ffb347',
  },
  {
    id: 'bolinha',
    name: 'Bolinha',
    tagline: 'Segure para subir, solte para cair. Passe pelos vãos.',
    href: 'bolinha/',
    accent: '#ffd23f',
  },
  {
    id: 'aviao',
    name: 'Acrobata',
    tagline: 'Segure para subir, solte para cair. Desvie e não encoste no chão.',
    href: 'aviao/',
    accent: '#ff7a45',
  },
  {
    id: 'cobrinha',
    name: 'Fominha',
    tagline: 'Deslize para virar. Coma dinheiro, ouro e mansões e cresça sem bater.',
    href: 'cobrinha/',
    accent: '#3fb45a',
  },
];

export function readBest(storage: Storage, game: GameId): number {
  try {
    const n = Number.parseInt(storage.getItem(gameKey(game, 'best')) ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}
