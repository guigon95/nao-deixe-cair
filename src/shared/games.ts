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
    id: 'bolinha',
    name: 'Bolinha',
    tagline: 'Segure para subir, solte para cair. Passe pelos vãos.',
    href: 'bolinha/',
    accent: '#ffd23f',
  },
  {
    id: 'aviao',
    name: 'Looping',
    tagline: 'Segure para acelerar, solte para mergulhar. Faça loops.',
    href: 'aviao/',
    accent: '#ff7a45',
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
