import { describe, expect, it } from 'vitest';
import { BALL_X, COINS, PHYSICS } from '../game/config';
import { GameEngine } from '../game/GameEngine';
import { MemoryStorage } from '../game/ScoreManager';
import { Wallet, WALLET_KEY } from '../game/Wallet';
import { SKINS, TRAILS } from '../game/cosmetics';
import { GameState } from '../game/types';

const dt = PHYSICS.fixedDt;

function cheat(e: GameEngine) {
  const b = e.obstacles.barriers.find((b) => b.x + b.width > e.ball.x - 14);
  if (b) {
    e.ball.y = (b.gapTop + b.gapBottom) / 2;
    e.ball.vy = 0;
  }
}

describe('Moedas no percurso', () => {
  it('nascem entre barreiras, no meio do caminho entre os vãos', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 11 });
    e.start();
    let seen = 0;
    for (let i = 0; i < 120 * 40; i++) {
      cheat(e);
      e.advance(dt);
      for (const c of e.coins.coins) {
        if (!c.active) continue;
        seen++;
        // nunca dentro de uma barreira
        for (const b of e.obstacles.barriers) {
          const inside = c.x + COINS.radius > b.x && c.x - COINS.radius < b.x + b.width;
          if (inside) expect(c.y > b.gapTop && c.y < b.gapBottom).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('passar pelo caminho pega moedas e não muda a pontuação do ranking', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 12 });
    const got: number[] = [];
    e.on((ev) => ev.type === 'coin' && got.push(ev.collected));
    e.start();
    for (let i = 0; i < 120 * 60; i++) {
      // segue as moedas quando estão perto, senão o vão
      const c = e.coins.coins.find((c) => c.active && c.x > e.ball.x - 4 && c.x - e.ball.x < 30);
      if (c) {
        e.ball.y = c.y;
        e.ball.vy = 0;
      } else cheat(e);
      e.advance(dt);
      if (e.state !== GameState.PLAYING) break;
    }
    expect(got.length).toBeGreaterThan(3);
    expect(e.coins.collected).toBe(got.length);
    // pontos = tempo + barreiras; moedas não entram
    expect(e.score.score).toBe(Math.floor(e.score.time) + e.score.barriers * 5);
  });

  it('a mesma semente gera as mesmas barreiras com ou sem moedas pegas', () => {
    const a = new GameEngine({ storage: new MemoryStorage(), seed: 13 });
    const b = new GameEngine({ storage: new MemoryStorage(), seed: 13 });
    a.start();
    b.start();
    for (let i = 0; i < 1200; i++) {
      cheat(a);
      cheat(b);
      a.advance(dt);
      b.advance(dt);
    }
    expect(a.obstacles.barriers.map((x) => x.gapTop)).toEqual(b.obstacles.barriers.map((x) => x.gapTop));
  });

  it('nova partida zera as moedas da partida; continuar mantém', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 14 });
    e.start();
    e.coins.collected = 5;
    const bar = e.obstacles.barriers[0];
    bar.x = BALL_X - bar.width / 2;
    e.ball.y = bar.gapTop - 30;
    e.advance(dt);
    expect(e.state).toBe(GameState.CONTINUE);
    e.continueRun();
    expect(e.coins.collected).toBe(5);
    e.pause();
    e.start();
    expect(e.coins.collected).toBe(0);
  });
});

describe('Carteira e loja', () => {
  it('começa com os itens grátis e 0 moedas', () => {
    const w = new Wallet(new MemoryStorage()).get();
    expect(w.coins).toBe(0);
    expect(w.skin).toBe('classica');
    expect(w.trail).toBe('padrao');
    expect(w.owned).toEqual(expect.arrayContaining(['classica', 'padrao']));
  });

  it('compra com moedas suficientes, usa e persiste', () => {
    const storage = new MemoryStorage();
    const w = new Wallet(storage);
    const basquete = SKINS.find((s) => s.id === 'basquete')!;
    expect(w.buy('basquete')).toBe(false); // sem moedas
    w.add(basquete.price + 3);
    expect(w.buy('basquete')).toBe(true);
    expect(w.coins).toBe(3);
    expect(w.buy('basquete')).toBe(false); // já tem
    expect(w.equip('basquete')).toBe(true);
    const again = new Wallet(storage).get();
    expect(again).toMatchObject({ coins: 3, skin: 'basquete' });
    expect(again.owned).toContain('basquete');
  });

  it('não usa item que não comprou e ignora ids desconhecidos', () => {
    const w = new Wallet(new MemoryStorage());
    w.add(9999);
    expect(w.equip('fogo')).toBe(false);
    expect(w.buy('nao-existe')).toBe(false);
    expect(w.buy(TRAILS.find((t) => t.id === 'fogo')!.id)).toBe(true);
    expect(w.equip('fogo')).toBe(true);
    expect(w.get().trail).toBe('fogo');
  });

  it('dados corrompidos ou adulterados voltam ao padrão seguro', () => {
    const storage = new MemoryStorage();
    storage.setItem(WALLET_KEY, '{oops');
    expect(new Wallet(storage).get().coins).toBe(0);
    storage.setItem(WALLET_KEY, JSON.stringify({ coins: -50, owned: [], skin: 'lava', trail: 'fogo' }));
    const w = new Wallet(storage).get();
    expect(w.coins).toBe(0);
    expect(w.skin).toBe('classica'); // não pode usar o que não tem
    expect(w.trail).toBe('padrao');
  });
});

describe('Carteira da conta (cópia local da nuvem)', () => {
  it('troca entre a carteira do aparelho e a da conta sem misturar', async () => {
    const { accountWalletKey } = await import('../game/Wallet');
    const storage = new MemoryStorage();
    const w = new Wallet(storage);
    w.add(10);
    w.switchTo(accountWalletKey('p1'));
    expect(w.coins).toBe(0);
    w.replace({ coins: 77, owned: ['classica', 'padrao', 'lava'], skin: 'lava', trail: 'padrao' });
    expect(w.get()).toMatchObject({ coins: 77, skin: 'lava' });
    w.switchTo(WALLET_KEY);
    expect(w.coins).toBe(10);
    w.switchTo(accountWalletKey('p1'));
    expect(w.get()).toMatchObject({ coins: 77, skin: 'lava' }); // abre na hora com a cópia
  });

  it('estado do servidor é validado (ids desconhecidos e item não comprado em uso)', () => {
    const w = new Wallet(new MemoryStorage());
    w.replace({ coins: 5, owned: ['classica', 'padrao', 'hack'], skin: 'lava', trail: 'fogo' });
    expect(w.get()).toMatchObject({ coins: 5, skin: 'classica', trail: 'padrao' });
    w.reset();
    expect(w.coins).toBe(0);
  });
});
