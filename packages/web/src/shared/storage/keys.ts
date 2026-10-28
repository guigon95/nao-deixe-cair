import type { Storage } from './storage';

/**
 * Chaves do localStorage do hub.
 *
 * Padrão: `ndc:<dado>` para o que é do hub (perfil, configurações) e
 * `ndc:<jogo>:<dado>` para o que é de cada jogo (recorde, ranking).
 */
export type GameId = 'bolinha' | 'aviao';

export const HUB_KEYS = {
  profile: 'ndc:profile',
  guestName: 'ndc:guest-name',
  /** Última conta online vista (só para mostrar o nome na hora; a sessão de verdade é o cookie). */
  account: 'ndc:account',
  settings: 'ndc:settings',
  /** Marca de que a migração das chaves antigas já rodou. */
  migrated: 'ndc:migrated',
} as const;

export function gameKey(game: GameId, what: 'best' | 'ranking'): string {
  return `ndc:${game}:${what}`;
}

/** Chaves usadas antes do hub (só existia o jogo da bolinha) → chaves novas. */
export const LEGACY_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['nao-deixe-cair:best', gameKey('bolinha', 'best')],
  ['nao-deixe-cair:ranking', gameKey('bolinha', 'ranking')],
  ['nao-deixe-cair:profile', HUB_KEYS.profile],
  ['nao-deixe-cair:guest-name', HUB_KEYS.guestName],
  ['nao-deixe-cair:settings', HUB_KEYS.settings],
];

export const MIGRATION_VERSION = '1';

/**
 * Copia uma única vez os dados antigos para as chaves novas. Não apaga as
 * antigas (se alguém abrir uma versão antiga em cache, nada se perde) e
 * nunca sobrescreve um valor novo que já exista. Retorna quantas chaves copiou.
 */
export function migrateLegacyKeys(storage: Storage): number {
  try {
    if (storage.getItem(HUB_KEYS.migrated) === MIGRATION_VERSION) return 0;
    let copied = 0;
    for (const [from, to] of LEGACY_KEYS) {
      const old = storage.getItem(from);
      if (old === null || old === '') continue;
      const current = storage.getItem(to);
      if (current !== null && current !== '') continue;
      storage.setItem(to, old);
      copied++;
    }
    storage.setItem(HUB_KEYS.migrated, MIGRATION_VERSION);
    return copied;
  } catch {
    return 0;
  }
}
