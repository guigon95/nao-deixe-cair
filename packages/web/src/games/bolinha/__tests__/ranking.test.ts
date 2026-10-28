import { describe, expect, it } from 'vitest';
import { RANKING_KEY } from '../game/config';
import { isValidName, LocalRanking, sanitizeName } from '../../../shared/ranking/Ranking';
import { MemoryStorage, SafeStorage } from '../game/ScoreManager';
import type { Storage } from '../game/types';
import { LocalAuthProvider } from '../../../shared/auth/auth';

const broken: Storage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

describe('Nomes', () => {
  it('limpa espaços, caracteres de controle e HTML, e limita o tamanho', () => {
    expect(sanitizeName('  Ana   Maria  ')).toBe('Ana Maria');
    expect(sanitizeName('<b>Zé</b>')).toBe('bZé/b');
    expect(sanitizeName('a\u0000b\nc')).toBe('abc');
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
  });

  it('exige de 2 a 16 caracteres com pelo menos uma letra ou número', () => {
    expect(isValidName('Zé')).toBe(true);
    expect(isValidName('João 123')).toBe(true);
    expect(isValidName('A')).toBe(false);
    expect(isValidName('   ')).toBe(false);
    expect(isValidName('!!!')).toBe(false);
  });
});

describe('Ranking local', () => {
  it('ordena por pontuação e informa a posição', () => {
    const r = new LocalRanking(new MemoryStorage());
    expect(r.submit('Ana', 50)?.position).toBe(1);
    expect(r.submit('Bia', 80)?.position).toBe(1);
    expect(r.submit('Caio', 60)?.position).toBe(2);
    expect(r.list().map((e) => e.name)).toEqual(['Bia', 'Caio', 'Ana']);
  });

  it('empate: quem fez primeiro fica na frente', () => {
    const r = new LocalRanking(new MemoryStorage());
    r.submit('Primeiro', 40);
    expect(r.submit('Segundo', 40)?.position).toBe(2);
  });

  it('guarda só o top 10 e calcula quanto falta para entrar', () => {
    const r = new LocalRanking(new MemoryStorage());
    for (let i = 1; i <= 10; i++) r.submit(`P${i}`, i * 10);
    expect(r.list()).toHaveLength(10);
    expect(r.threshold()).toBe(11);
    expect(r.qualifies(10)).toBe(false);
    expect(r.submit('Fraco', 10)).toBeNull();
    expect(r.submit('Bom', 55)?.position).toBe(6);
    expect(r.list()).toHaveLength(10);
    expect(r.list().at(-1)!.score).toBe(20); // o 10 saiu
  });

  it('não aceita pontuação zero, inválida ou nome inválido', () => {
    const r = new LocalRanking(new MemoryStorage());
    expect(r.submit('Ana', 0)).toBeNull();
    expect(r.submit('Ana', NaN)).toBeNull();
    expect(r.submit('A', 30)).toBeNull();
    expect(r.list()).toHaveLength(0);
  });

  it('persiste e recarrega (sobrevive a atualizar a página)', () => {
    const storage = new MemoryStorage();
    const a = new LocalRanking(storage);
    a.submit('Ana', 42, 'local-1');
    const b = new LocalRanking(storage);
    expect(b.list()).toEqual([expect.objectContaining({ name: 'Ana', score: 42, profileId: 'local-1' })]);
  });

  it('ignora dados corrompidos e registros inválidos', () => {
    const storage = new MemoryStorage();
    storage.setItem(RANKING_KEY, '{oops');
    expect(new LocalRanking(storage).list()).toEqual([]);
    storage.setItem(
      RANKING_KEY,
      JSON.stringify([{ name: 'Ok', score: 10 }, { name: 5, score: 'x' }, null, { name: 'Neg', score: -3 }]),
    );
    expect(new LocalRanking(storage).list().map((e) => e.name)).toEqual(['Ok']);
  });

  it('armazenamento bloqueado não impede usar o ranking na sessão', () => {
    const r = new LocalRanking(new SafeStorage(broken));
    expect(r.submit('Ana', 10)?.position).toBe(1);
    expect(() => new LocalRanking(broken).submit('Bia', 5)).not.toThrow();
  });
});

describe('Perfil local (login sem servidor)', () => {
  it('entra, persiste, mantém o id ao trocar o nome e sai', () => {
    const storage = new MemoryStorage();
    const auth = new LocalAuthProvider(storage);
    expect(auth.current()).toBeNull();
    const p = auth.signIn('  Gui  ')!;
    expect(p.name).toBe('Gui');
    expect(new LocalAuthProvider(storage).current()?.id).toBe(p.id);
    const p2 = auth.signIn('Guilherme')!;
    expect(p2.id).toBe(p.id);
    auth.signOut();
    expect(auth.current()).toBeNull();
    expect(new LocalAuthProvider(storage).current()).toBeNull();
  });

  it('recusa nome inválido', () => {
    const auth = new LocalAuthProvider(new MemoryStorage());
    expect(auth.signIn('x')).toBeNull();
    expect(auth.current()).toBeNull();
  });

  it('lembra o último nome de convidado para sugerir no campo', () => {
    const storage = new MemoryStorage();
    new LocalAuthProvider(storage).rememberGuestName(' Bia ');
    expect(new LocalAuthProvider(storage).lastGuestName()).toBe('Bia');
  });

  it('armazenamento que lança erro não quebra o login', () => {
    const auth = new LocalAuthProvider(broken);
    expect(auth.signIn('Ana')?.name).toBe('Ana');
    expect(() => auth.signOut()).not.toThrow();
    expect(auth.lastGuestName()).toBe('');
  });
});
