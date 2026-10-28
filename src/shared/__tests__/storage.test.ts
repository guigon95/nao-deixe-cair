import { describe, expect, it } from 'vitest';
import { LocalAuthProvider } from '../auth/auth';
import { readBest } from '../games';
import { LocalRanking } from '../ranking/Ranking';
import { loadSettings } from '../settings/settings';
import { gameKey, HUB_KEYS, LEGACY_KEYS, migrateLegacyKeys, MIGRATION_VERSION } from '../storage/keys';
import { MemoryStorage, type Storage } from '../storage/storage';

function legacyStore(): MemoryStorage {
  const s = new MemoryStorage();
  s.setItem('nao-deixe-cair:best', '42');
  s.setItem(
    'nao-deixe-cair:ranking',
    JSON.stringify([{ id: 'a', name: 'Bia', score: 42, date: '2026-10-01', profileId: 'local-x' }]),
  );
  s.setItem(
    'nao-deixe-cair:profile',
    JSON.stringify({ id: 'local-x', name: 'Bia', provider: 'local', createdAt: '2026-10-01' }),
  );
  s.setItem('nao-deixe-cair:guest-name', 'Bia');
  s.setItem('nao-deixe-cair:settings', JSON.stringify({ sound: false, reducedMotion: true }));
  return s;
}

describe('migração das chaves antigas do localStorage', () => {
  it('copia recorde, ranking, perfil, nome e configurações para as chaves novas', () => {
    const s = legacyStore();
    expect(migrateLegacyKeys(s)).toBe(LEGACY_KEYS.length);
    expect(readBest(s, 'bolinha')).toBe(42);
    expect(new LocalRanking(s, { key: gameKey('bolinha', 'ranking') }).list()[0]).toMatchObject({ name: 'Bia', score: 42 });
    expect(new LocalAuthProvider(s).current()?.id).toBe('local-x');
    expect(new LocalAuthProvider(s).lastGuestName()).toBe('Bia');
    expect(loadSettings(s)).toEqual({ sound: false, reducedMotion: true });
  });

  it('roda uma única vez e não apaga as chaves antigas', () => {
    const s = legacyStore();
    migrateLegacyKeys(s);
    expect(s.getItem(HUB_KEYS.migrated)).toBe(MIGRATION_VERSION);
    // Depois da migração o jogador bate um recorde novo...
    s.setItem(gameKey('bolinha', 'best'), '99');
    // ...e uma segunda chamada não volta ao valor antigo.
    expect(migrateLegacyKeys(s)).toBe(0);
    expect(readBest(s, 'bolinha')).toBe(99);
    expect(s.getItem('nao-deixe-cair:best')).toBe('42');
  });

  it('nunca sobrescreve um valor novo que já exista', () => {
    const s = legacyStore();
    s.setItem(gameKey('bolinha', 'best'), '7');
    migrateLegacyKeys(s);
    expect(readBest(s, 'bolinha')).toBe(7);
  });

  it('aparelho novo (sem dados): só marca como migrado', () => {
    const s = new MemoryStorage();
    expect(migrateLegacyKeys(s)).toBe(0);
    expect(s.getItem(HUB_KEYS.migrated)).toBe(MIGRATION_VERSION);
    expect(readBest(s, 'bolinha')).toBe(0);
  });

  it('armazenamento quebrado não derruba nada', () => {
    const broken: Storage = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(() => migrateLegacyKeys(broken)).not.toThrow();
  });
});

describe('perfil do hub e ranking por jogo', () => {
  it('quem entra num jogo aparece logado no outro (mesma chave de perfil)', () => {
    const s = new MemoryStorage();
    const p = new LocalAuthProvider(s).signIn('Rafa');
    // Outro jogo cria o seu próprio provedor sobre o mesmo armazenamento.
    expect(new LocalAuthProvider(s).current()?.id).toBe(p?.id);
  });

  it('ranking e recorde são separados por jogo', () => {
    const s = new MemoryStorage();
    const bolinha = new LocalRanking(s, { key: gameKey('bolinha', 'ranking') });
    const aviao = new LocalRanking(s, { key: gameKey('aviao', 'ranking') });
    bolinha.submit('Ana', 30);
    aviao.submit('Leo', 500);
    expect(bolinha.list().map((e) => e.name)).toEqual(['Ana']);
    expect(aviao.list().map((e) => e.name)).toEqual(['Leo']);
    s.setItem(gameKey('aviao', 'best'), '500');
    expect(readBest(s, 'bolinha')).toBe(0);
    expect(readBest(s, 'aviao')).toBe(500);
  });
});
