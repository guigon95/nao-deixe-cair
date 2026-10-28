import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Client, makeApp, prisma, resetDb, SECRET } from './helpers';
import { issueRunToken } from '../src/lib/runToken';
import { CATALOG, IMPORT_MAX_COINS } from '../src/lib/shop';
// catálogo do front: preços e ids têm que bater com o do servidor
import { SKINS, TRAILS } from '../../web/src/games/bolinha/game/cosmetics';

let app: FastifyInstance;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const token = (secondsAgo: number) => issueRunToken(SECRET, 'bolinha', Date.now() - secondsAgo * 1000).token;

async function register(name: string) {
  const c = new Client(app);
  const r = await c.post('/api/auth/register', { name, password: 'senha123' });
  expect(r.statusCode, r.body).toBe(201);
  return c;
}

/** Ganha moedas jogando (envio de pontuação com moedas). */
async function earn(c: Client, coins: number, seconds = 300) {
  const r = await c.post('/api/games/bolinha/scores', { token: token(seconds), score: 10, coins });
  expect(r.statusCode, r.body).toBe(201);
  return r.data.wallet;
}

describe('catálogo', () => {
  it('servidor e front têm os mesmos itens e preços', () => {
    const front = [...SKINS.map((s) => ({ id: s.id, kind: 'skin', price: s.price })), ...TRAILS.map((t) => ({ id: t.id, kind: 'trail', price: t.price }))];
    expect([...CATALOG.bolinha].sort((a, b) => a.id.localeCompare(b.id))).toEqual(front.sort((a, b) => a.id.localeCompare(b.id)));
  });
});

describe('carteira na nuvem', () => {
  it('exige conta', async () => {
    expect((await new Client(app).get('/api/games/bolinha/wallet')).statusCode).toBe(401);
    expect((await new Client(app).post('/api/games/bolinha/shop/buy', { item: 'basquete' })).statusCode).toBe(401);
  });

  it('começa com os itens grátis e 0 moedas', async () => {
    const c = await register('Gui');
    const r = await c.get('/api/games/bolinha/wallet');
    expect(r.data.wallet).toMatchObject({ coins: 0, skin: 'classica', trail: 'padrao', imported: false });
    expect(r.data.wallet.owned).toEqual(expect.arrayContaining(['classica', 'padrao']));
  });

  it('moedas da partida entram na carteira junto com a pontuação, com teto pelo tempo', async () => {
    const c = await register('Gui');
    expect((await earn(c, 7)).coins).toBe(7);
    expect((await earn(c, 5)).coins).toBe(12);
    // partida de 10 s não rende 500 moedas: credita só o teto
    const capped = await earn(c, 500, 10);
    expect(capped.coins).toBeLessThanOrEqual(12 + 13);
    // convidado não tem carteira na nuvem
    const g = await new Client(app).post('/api/games/bolinha/scores', { token: token(60), score: 10, coins: 5, name: 'Bia' });
    expect(g.statusCode).toBe(201);
    expect(g.data.wallet).toBeUndefined();
  });

  it('mesma conta em outro aparelho vê as mesmas moedas e itens', async () => {
    const a = await register('Gui');
    await earn(a, 30);
    const buy = await a.post('/api/games/bolinha/shop/buy', { item: 'basquete' });
    expect(buy.data.wallet).toMatchObject({ coins: 5, skin: 'basquete' });
    const b = new Client(app);
    await b.post('/api/auth/login', { name: 'Gui', password: 'senha123' });
    const w = (await b.get('/api/games/bolinha/wallet')).data.wallet;
    expect(w).toMatchObject({ coins: 5, skin: 'basquete' });
    expect(w.owned).toContain('basquete');
  });

  it('não compra sem moedas, item inexistente nem desconta duas vezes', async () => {
    const c = await register('Gui');
    expect((await c.post('/api/games/bolinha/shop/buy', { item: 'lava' })).statusCode).toBe(422);
    expect((await c.post('/api/games/bolinha/shop/buy', { item: 'nao-existe' })).statusCode).toBe(404);
    await earn(c, 50);
    const [r1, r2] = await Promise.all([
      c.post('/api/games/bolinha/shop/buy', { item: 'bolhas' }),
      c.post('/api/games/bolinha/shop/buy', { item: 'bolhas' }),
    ]);
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    const w = (await c.get('/api/games/bolinha/wallet')).data.wallet;
    expect(w.coins).toBe(30); // 50 - 20, uma vez só
    expect(w.owned.filter((x: string) => x === 'bolhas')).toHaveLength(1);
  });

  it('equipar só o que tem', async () => {
    const c = await register('Gui');
    expect((await c.post('/api/games/bolinha/shop/equip', { item: 'fogo' })).statusCode).toBe(422);
    await earn(c, 100);
    await c.post('/api/games/bolinha/shop/buy', { item: 'fogo' });
    await c.post('/api/games/bolinha/shop/equip', { item: 'padrao' });
    expect((await c.get('/api/games/bolinha/wallet')).data.wallet.trail).toBe('padrao');
    expect((await c.post('/api/games/bolinha/shop/equip', { item: 'fogo' })).data.wallet.trail).toBe('fogo');
  });

  it('importa a carteira do aparelho uma única vez, com limite e só itens válidos', async () => {
    const c = await register('Gui');
    const r = await c.post('/api/games/bolinha/wallet/import', { coins: 99999, owned: ['planeta', 'hackeado'], skin: 'planeta', trail: 'fogo' });
    expect(r.data.imported).toBe(true);
    expect(r.data.wallet).toMatchObject({ coins: IMPORT_MAX_COINS, skin: 'planeta', trail: 'padrao', imported: true });
    expect(r.data.wallet.owned).toContain('planeta');
    expect(r.data.wallet.owned).not.toContain('hackeado');
    const again = await c.post('/api/games/bolinha/wallet/import', { coins: 100, owned: ['lava'] });
    expect(again.data.imported).toBe(false);
    expect(again.data.wallet.coins).toBe(IMPORT_MAX_COINS);
    expect(again.data.wallet.owned).not.toContain('lava');
  });

  it('o cliente não consegue definir o saldo', async () => {
    const c = await register('Gui');
    // não existe rota para "setar" moedas; campos extras são ignorados
    expect((await c.post('/api/games/bolinha/wallet', { coins: 9999 })).statusCode).toBe(404);
    expect((await c.post('/api/games/bolinha/shop/buy', { item: 'basquete', coins: 9999 })).statusCode).toBe(422);
    expect((await prisma.wallet.findFirstOrThrow()).coins).toBe(0);
  });
});
