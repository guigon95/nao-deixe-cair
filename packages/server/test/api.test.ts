import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Client, makeApp, prisma, resetDb, SECRET } from './helpers';
import { issueRunToken } from '../src/lib/runToken';
import { nameKey } from '../src/lib/names';
import { previousWeek, weekWindow } from '../src/lib/week';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

/** Token de uma partida que "começou" há `secondsAgo` segundos. */
const oldToken = (game: 'bolinha' | 'aviao' | 'corrida', secondsAgo: number) => issueRunToken(SECRET, game, Date.now() - secondsAgo * 1000).token;

async function register(name: string, password = 'senha123') {
  const c = new Client(app);
  const r = await c.post('/api/auth/register', { name, password });
  expect(r.statusCode, r.body).toBe(201);
  return c;
}

describe('saúde e proteção', () => {
  it('health confere o banco', async () => {
    const r = await new Client(app).get('/api/health');
    expect(r.statusCode).toBe(200);
    expect(r.data).toMatchObject({ ok: true, database: 'ok' });
  });

  it('recusa POST sem o header anti-CSRF', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Ana', password: 'senha123' } });
    expect(r.statusCode).toBe(403);
  });

  it('jogo desconhecido dá 422', async () => {
    expect((await new Client(app).get('/api/games/xadrez/ranking')).statusCode).toBe(422);
  });
});

describe('contas', () => {
  it('cria conta, mantém a sessão, sai e entra de novo', async () => {
    const c = await register('  Gui  ');
    const me = await c.get('/api/auth/me');
    expect(me.data.player.name).toBe('Gui');
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).statusCode).toBe(401);
    const login = await c.post('/api/auth/login', { name: 'gui', password: 'senha123' });
    expect(login.statusCode).toBe(200);
    expect((await c.get('/api/auth/me')).data.player.name).toBe('Gui');
  });

  it('apelido é único sem diferenciar maiúscula nem acento', async () => {
    await register('Zé');
    const r = await new Client(app).post('/api/auth/register', { name: 'ZE', password: 'outra123' });
    expect(r.statusCode).toBe(409);
    expect(nameKey('  Zé  ')).toBe(nameKey('ze'));
  });

  it('senha errada e apelido inexistente dão a mesma resposta', async () => {
    await register('Ana');
    const a = await new Client(app).post('/api/auth/login', { name: 'Ana', password: 'errada99' });
    const b = await new Client(app).post('/api/auth/login', { name: 'Ninguem', password: 'errada99' });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.data.error).toBe(b.data.error);
  });

  it('valida apelido e senha', async () => {
    const c = new Client(app);
    expect((await c.post('/api/auth/register', { name: 'A', password: 'senha123' })).statusCode).toBe(422);
    expect((await c.post('/api/auth/register', { name: '!!!', password: 'senha123' })).statusCode).toBe(422);
    const short = await c.post('/api/auth/register', { name: 'Bia', password: '123' });
    expect(short.statusCode).toBe(422);
    expect(short.data.error).toMatch(/6 caracteres/);
  });

  it('a senha nunca é guardada em texto', async () => {
    await register('Caio', 'minhasenha');
    const p = await prisma.player.findFirstOrThrow();
    expect(p.passwordHash).not.toContain('minhasenha');
    expect(p.passwordHash.startsWith('$2')).toBe(true);
  });
});

describe('SQL injection', () => {
  const evil = [`x'; DROP TABLE "Player"; --`, `' OR '1'='1`, `"; DELETE FROM "Score"; --`, `bolinha' OR 1=1 --`];

  it('apelidos e senhas maliciosos viram texto comum, nunca SQL', async () => {
    for (const [i, name] of evil.entries()) {
      const c = new Client(app);
      const r = await c.post('/api/auth/register', { name: name.slice(0, 14) + i, password: `' OR '1'='1` });
      expect([201, 422]).toContain(r.statusCode);
    }
    // login com "' OR '1'='1" não entra em conta nenhuma
    await register('Vitima');
    const hack = await new Client(app).post('/api/auth/login', { name: 'Vitima', password: `' OR '1'='1` });
    expect(hack.statusCode).toBe(401);
    // as tabelas continuam lá e intactas
    expect(await prisma.player.count()).toBeGreaterThan(0);
    const guest = await new Client(app).post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 10, name: `a'); DROP TABLE "Score"; --` });
    expect(guest.statusCode, guest.body).toBe(201);
    const list = await new Client(app).get('/api/games/bolinha/ranking');
    expect(list.statusCode).toBe(200);
    expect(list.data.entries[0].name).toBe(`a'); DROP TABLE "Score"; --`.slice(0, 16).trim());
  });

  it('o jogo na URL só aceita os ids conhecidos', async () => {
    for (const g of [`bolinha' OR '1'='1`, `bolinha";--`, encodeURIComponent(`x' UNION SELECT * FROM "Player" --`)]) {
      expect((await new Client(app).get(`/api/games/${g}/ranking`)).statusCode).toBe(422);
    }
  });

  it('senha com mais de 72 bytes é recusada (o bcrypt ignoraria o resto)', async () => {
    const r = await new Client(app).post('/api/auth/register', { name: 'Longa', password: 'ç'.repeat(40) });
    expect(r.statusCode).toBe(422);
  });
});

describe('ranking', () => {
  it('fluxo completo: conta envia, ranking mostra a melhor de cada um', async () => {
    const gui = await register('Gui');
    const t1 = (await gui.post('/api/games/bolinha/runs')).data.token;
    // partida de verdade leva tempo; simulamos com token mais antigo
    const s1 = await gui.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 40 });
    expect(s1.statusCode, s1.body).toBe(201);
    expect(s1.data).toMatchObject({ position: 1, personalBest: true, score: 40 });
    expect(typeof t1).toBe('string');

    const pior = await gui.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 25 });
    expect(pior.data).toMatchObject({ personalBest: false, position: 1, score: 25 });
    expect(pior.data.entry.score).toBe(40);

    const guest = new Client(app);
    const g = await guest.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: 90, name: 'Visitante' });
    expect(g.statusCode, g.body).toBe(201);
    expect(g.data.position).toBe(1);

    const list = await gui.get('/api/games/bolinha/ranking');
    expect(list.data.entries.map((e: { name: string; score: number }) => [e.name, e.score])).toEqual([
      ['Visitante', 90],
      ['Gui', 40],
    ]);
    expect(list.data.entries[1].profileId).toBeTruthy();
    expect(list.data.entries[0].profileId).toBeUndefined();
    expect(list.data.me).toEqual({ best: 40, position: 2 });
    // ranking de outro jogo é separado
    expect((await gui.get('/api/games/aviao/ranking')).data.entries).toEqual([]);
  });

  it('empate: quem fez primeiro fica na frente', async () => {
    const a = await register('Primeiro');
    const b = await register('Segundo');
    await a.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 20), score: 30 });
    const r = await b.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 20), score: 30 });
    expect(r.data.position).toBe(2);
  });

  it('cada partida só pode ser enviada uma vez', async () => {
    const c = await register('Ana');
    const token = oldToken('bolinha', 30);
    expect((await c.post('/api/games/bolinha/scores', { token, score: 10 })).statusCode).toBe(201);
    expect((await c.post('/api/games/bolinha/scores', { token, score: 12 })).statusCode).toBe(409);
  });

  it('recusa token falso, de outro jogo ou expirado', async () => {
    const c = await register('Ana');
    const good = oldToken('bolinha', 30);
    const forged = good.slice(0, -3) + (good.endsWith('aaa') ? 'bbb' : 'aaa');
    expect((await c.post('/api/games/bolinha/scores', { token: forged, score: 10 })).statusCode).toBe(400);
    expect((await c.post('/api/games/aviao/scores', { token: oldToken('bolinha', 30), score: 10 })).statusCode).toBe(400);
    expect((await c.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 7 * 3600), score: 10 })).statusCode).toBe(400);
    const otherSecret = issueRunToken('outro-segredo-0123456789', 'bolinha', Date.now() - 30_000).token;
    expect((await c.post('/api/games/bolinha/scores', { token: otherSecret, score: 10 })).statusCode).toBe(400);
  });

  it('recusa pontuação impossível para a duração da partida', async () => {
    const c = await register('Ana');
    const fresh = (await c.post('/api/games/bolinha/runs')).data.token;
    const r = await c.post('/api/games/bolinha/scores', { token: fresh, score: 5000 });
    expect(r.statusCode).toBe(422);
    // o Acrobata pontua bem mais rápido (manobras × combo) e tem teto próprio
    const a = await c.post('/api/games/aviao/scores', { token: oldToken('aviao', 60), score: 30_000 });
    expect(a.statusCode, a.body).toBe(201);
    expect((await c.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 0 })).statusCode).toBe(422);
    expect((await c.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 1.5 })).statusCode).toBe(422);
  });

  it('Disparada (corrida): ranking próprio e teto pela duração da partida', async () => {
    const c = await register('Corredor');
    const ok = await c.post('/api/games/corrida/scores', { token: oldToken('corrida', 60), score: 3200 });
    expect(ok.statusCode, ok.body).toBe(201);
    expect((await c.post('/api/games/corrida/scores', { token: oldToken('corrida', 60), score: 50_000 })).statusCode).toBe(422);
    expect((await c.get('/api/games/corrida/ranking')).data.entries.map((e: { score: number }) => e.score)).toEqual([3200]);
    expect((await c.get('/api/games/aviao/ranking')).data.entries).toEqual([]);
  });

  it('convidado: precisa de nome válido, não pode usar apelido de conta e só entra se for top 10', async () => {
    await register('Gui');
    const guest = new Client(app);
    expect((await guest.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 10 })).statusCode).toBe(422);
    const imp = await guest.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 10, name: 'gui' });
    expect(imp.statusCode).toBe(409);

    for (let i = 1; i <= 10; i++) {
      const r = await guest.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: i * 10, name: `P${i}` });
      expect(r.statusCode, r.body).toBe(201);
    }
    const fraco = await guest.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: 10, name: 'Fraco' });
    expect(fraco.statusCode).toBe(422);
    const bom = await guest.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: 55, name: 'Bom' });
    expect(bom.data.position).toBe(6);
    const list = (await guest.get('/api/games/bolinha/ranking')).data.entries;
    expect(list).toHaveLength(10);
    expect(list.at(-1).score).toBe(20);
  });

  it('conta guarda toda partida mesmo fora do top 10 e informa a posição', async () => {
    const guest = new Client(app);
    for (let i = 1; i <= 10; i++) await guest.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: 100 + i, name: `P${i}` });
    const c = await register('Ana');
    const r = await c.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 15 });
    expect(r.statusCode).toBe(201);
    expect(r.data.position).toBe(11);
    expect((await c.get('/api/games/bolinha/ranking')).data.me).toEqual({ best: 15, position: 11 });
  });

  it('limpa o nome de convidado', async () => {
    const r = await new Client(app).post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 10, name: '  <b>Zé</b>  ' });
    expect(r.data.entry.name).toBe('bZé/b');
  });
});

describe('limite de tentativas', () => {
  it('login tem limite próprio fora do modo de teste', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { loadConfig } = await import('../src/config');
    const { buildApp } = await import('../src/createApp');
    const config = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x', APP_SECRET: SECRET });
    const { app: prod } = await buildApp({ prisma, config, logger: false });
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await prod.inject({ method: 'POST', url: '/api/auth/login', headers: { 'x-ndc-csrf': '1' }, payload: { name: 'X', password: 'y' } })).statusCode;
    }
    expect(last).toBe(429);
    await prod.close();
    vi.unstubAllEnvs();
  });

  it('produção exige APP_SECRET', async () => {
    const { loadConfig } = await import('../src/config');
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://x' })).toThrow(/APP_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });
});

describe('ranking semanal', () => {
  /** Grava uma partida direto no banco, numa data qualquer (semana passada etc.). */
  async function scoreAt(name: string, score: number, when: Date, playerId?: string) {
    await prisma.score.create({ data: { game: 'bolinha', score, name, playerId: playerId ?? null, runId: `r-${Math.random()}`, durationMs: 60_000, createdAt: when } });
  }

  it('a semana vai de segunda 00:00 a domingo, no horário de Brasília', () => {
    // quarta, 28/10/2026 20:00 em Brasília = 23:00 UTC
    const w = weekWindow(new Date('2026-10-28T23:00:00Z'));
    expect(w.start.toISOString()).toBe('2026-10-26T03:00:00.000Z'); // seg 26/10 00:00 BRT
    expect(w.end.toISOString()).toBe('2026-11-02T03:00:00.000Z');
    // domingo 23:30 BRT ainda é a mesma semana; segunda 00:00 já é a próxima
    expect(weekWindow(new Date('2026-11-02T02:30:00Z')).start.toISOString()).toBe('2026-10-26T03:00:00.000Z');
    expect(weekWindow(new Date('2026-11-02T03:00:00Z')).start.toISOString()).toBe('2026-11-02T03:00:00.000Z');
    expect(previousWeek(w).start.toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });

  it('a semanal só conta partidas desta semana e mostra o campeão da semana passada', async () => {
    const w = weekWindow();
    const lastWeek = new Date(w.start.getTime() - 2 * 86_400_000);
    await scoreAt('Lenda', 500, lastWeek);
    await scoreAt('Antigo', 300, lastWeek);
    await scoreAt('Novato', 40, new Date());
    const c = new Client(app);
    const all = await c.get('/api/games/bolinha/ranking?period=all');
    expect(all.data.entries.map((e: { name: string }) => e.name)).toEqual(['Lenda', 'Antigo', 'Novato']);
    const week = await c.get('/api/games/bolinha/ranking?period=week');
    expect(week.data.period).toBe('week');
    expect(week.data.entries.map((e: { name: string }) => e.name)).toEqual(['Novato']);
    expect(week.data.week).toMatchObject({ start: w.start.toISOString(), end: w.end.toISOString(), lastChampion: { name: 'Lenda', score: 500 } });
    expect((await c.get('/api/games/bolinha/ranking?period=mes')).statusCode).toBe(422);
  });

  it('o envio informa a posição na semana e no geral', async () => {
    const lastWeek = new Date(weekWindow().start.getTime() - 86_400_000);
    await scoreAt('Lenda', 500, lastWeek);
    const gui = await register('Gui');
    const r = await gui.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: 50 });
    expect(r.data.position).toBe(2); // geral: atrás da Lenda
    expect(r.data.week).toMatchObject({ position: 1, best: 50, personalBest: true }); // semana: 1º
    const worse = await gui.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: 20 });
    expect(worse.data.week).toMatchObject({ position: 1, best: 50, personalBest: false });
    expect((await gui.get('/api/games/bolinha/ranking?period=week')).data.me).toEqual({ best: 50, position: 1 });
  });

  it('o melhor da conta na semana conta só partidas desta semana', async () => {
    const gui = await register('Gui');
    const me = await prisma.player.findFirstOrThrow();
    await scoreAt('Gui', 900, new Date(weekWindow().start.getTime() - 3600_000), me.id);
    const r = await gui.post('/api/games/bolinha/scores', { token: oldToken('bolinha', 60), score: 30 });
    expect(r.data.personalBest).toBe(false); // no geral, 900 continua o melhor
    expect(r.data.week).toMatchObject({ best: 30, personalBest: true, position: 1 });
  });

  it('convidado entra se for top 10 da semana, mesmo sem ser top 10 geral', async () => {
    const lastWeek = new Date(weekWindow().start.getTime() - 86_400_000);
    for (let i = 0; i < 10; i++) await scoreAt(`Velho${i}`, 1000 + i, lastWeek);
    const r = await new Client(app).post('/api/games/bolinha/scores', { token: oldToken('bolinha', 30), score: 15, name: 'Bia' });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.data.week.position).toBe(1);
    expect(r.data.position).toBe(11);
  });
});
