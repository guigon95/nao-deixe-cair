import { describe, expect, it } from 'vitest';
import { BALL_X, PHYSICS, SCORING, STORAGE_KEYS } from '../game/config';
import { GameEngine } from '../game/GameEngine';
import { GameLoop, type FrameScheduler } from '../../../shared/loop/GameLoop';
import { MemoryStorage, SafeStorage, ScoreManager } from '../game/ScoreManager';
import { GameState, type Storage } from '../game/types';

const dt = PHYSICS.fixedDt;

/** Mantém a bolinha sempre no vão da próxima barreira (passagem garantida). */
function cheat(e: GameEngine) {
  const next = e.obstacles.barriers.find((b) => b.x + b.width >= e.ball.x - e.ball.radius);
  if (next) e.ball.y = (next.gapTop + next.gapBottom) / 2;
  e.ball.vy = 0;
}

describe('Estados da partida', () => {
  it('começa em READY e não simula até iniciar', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    expect(e.state).toBe(GameState.READY);
    expect(e.advance(0.05)).toBe(0);
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.advance(0.05)).toBeGreaterThan(0);
  });

  it('pausa interrompe a simulação por completo', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    e.start();
    e.advance(0.05);
    e.pause();
    expect(e.state).toBe(GameState.PAUSED);
    const snap = { y: e.ball.y, t: e.elapsed, xs: e.obstacles.barriers.map((b) => b.x), s: e.score.score };
    for (let i = 0; i < 100; i++) e.advance(0.1);
    expect(e.ball.y).toBe(snap.y);
    expect(e.elapsed).toBe(snap.t);
    expect(e.obstacles.barriers.map((b) => b.x)).toEqual(snap.xs);
    expect(e.score.score).toBe(snap.s);
  });

  it('retomada passa por contagem curta, solta o controle e não dá saltos físicos', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1, resumeDelay: 1 });
    e.start();
    e.setHolding(true);
    e.advance(0.05);
    e.pause();
    expect(e.holding).toBe(false);
    e.resume();
    expect(e.state).toBe(GameState.RESUMING);
    const y = e.ball.y;
    const t = e.elapsed;
    for (let i = 0; i < 30; i++) e.advance(1 / 60);
    expect(e.state).toBe(GameState.RESUMING);
    expect(e.ball.y).toBe(y); // contagem não move nada
    let frames = 0;
    while (e.state === GameState.RESUMING && frames < 100) {
      e.advance(1 / 60);
      frames++;
    }
    expect(frames).toBeLessThanOrEqual(32); // ~1 s de contagem
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.elapsed).toBe(t); // tempo da contagem não é simulado
    // Primeiro quadro após voltar de uma aba oculta (dt enorme) é limitado.
    e.advance(30);
    expect(e.elapsed - t).toBeLessThanOrEqual(PHYSICS.maxFrameTime + 1e-9);
  });

  it('pausar durante a contagem volta para PAUSED', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    e.start();
    e.pause();
    e.resume();
    e.pause();
    expect(e.state).toBe(GameState.PAUSED);
  });

  it('transições inválidas são ignoradas', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    e.pause(); // READY → PAUSED não existe
    expect(e.state).toBe(GameState.READY);
    e.resume();
    expect(e.state).toBe(GameState.READY);
  });

  it('reiniciar zera a partida (bolinha, tempo, barreiras, pontos)', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1, lives: 0 });
    e.start();
    for (let i = 0; i < 600; i++) {
      cheat(e);
      e.advance(dt);
    }
    expect(e.score.score).toBeGreaterThan(0);
    e.obstacles.barriers[0].x = BALL_X; // força colisão
    e.ball.y = 0;
    e.advance(dt);
    expect(e.state).toBe(GameState.GAME_OVER);
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.elapsed).toBe(0);
    expect(e.score.score).toBe(0);
    expect(e.ball.vy).toBe(0);
    expect(e.obstacles.barriers.length).toBeGreaterThan(0);
    expect(e.obstacles.barriers.every((b) => !b.passed && b.x > 300)).toBe(true);
  });

  it('pode reiniciar direto da pausa e voltar ao menu', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    e.start();
    e.advance(0.2);
    e.pause();
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.elapsed).toBe(0);
    e.pause();
    e.toMenu();
    expect(e.state).toBe(GameState.READY);
  });
});

describe('Laço de animação', () => {
  function fakeScheduler() {
    const pending = new Map<number, (t: number) => void>();
    let id = 0;
    const s: FrameScheduler & { flush(t: number): void; pending: Map<number, (t: number) => void> } = {
      pending,
      request(cb) {
        pending.set(++id, cb);
        return id;
      },
      cancel(i) {
        pending.delete(i);
      },
      flush(t) {
        const cbs = [...pending.values()];
        pending.clear();
        for (const cb of cbs) cb(t);
      },
    };
    return s;
  }

  it('start() repetido (reinícios, StrictMode) nunca cria laços duplicados', () => {
    const sched = fakeScheduler();
    let frames = 0;
    const loop = new GameLoop(() => frames++, sched);
    loop.start();
    loop.start();
    loop.start();
    expect(sched.pending.size).toBe(1);
    sched.flush(0);
    sched.flush(16);
    expect(frames).toBe(2);
    expect(sched.pending.size).toBe(1);
    loop.stop();
    expect(sched.pending.size).toBe(0);
    loop.start();
    expect(sched.pending.size).toBe(1);
    expect(loop.activeLoops).toBe(1);
  });

  it('usa o timestamp do rAF para o delta e resetClock descarta pausas longas', () => {
    const sched = fakeScheduler();
    const dts: number[] = [];
    const loop = new GameLoop((d) => dts.push(d), sched);
    loop.start();
    sched.flush(1000);
    sched.flush(1016);
    loop.resetClock();
    sched.flush(60_000);
    expect(dts[0]).toBe(0);
    expect(dts[1]).toBeCloseTo(0.016, 6);
    expect(dts[2]).toBe(0);
  });

  it('um erro em um quadro não derruba o laço', () => {
    const sched = fakeScheduler();
    let n = 0;
    const orig = console.error;
    console.error = () => {};
    const loop = new GameLoop(() => {
      n++;
      if (n === 1) throw new Error('boom');
    }, sched);
    loop.start();
    sched.flush(0);
    sched.flush(16);
    console.error = orig;
    expect(n).toBe(2);
    expect(sched.pending.size).toBe(1);
  });
});

describe('Pontuação', () => {
  it('1 ponto por segundo + 5 por barreira, cada barreira pontua só uma vez', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 8 });
    e.start();
    const passes: number[] = [];
    e.on((ev) => ev.type === 'pass' && passes.push(ev.barrier.id));
    for (let i = 0; i < 120 * 20; i++) {
      cheat(e);
      e.advance(dt);
    }
    expect(e.state).toBe(GameState.PLAYING);
    expect(passes.length).toBeGreaterThan(5);
    expect(new Set(passes).size).toBe(passes.length); // nenhuma repetida
    expect(e.score.barriers).toBe(passes.length);
    expect(e.score.score).toBe(
      Math.floor(e.score.time * SCORING.pointsPerSecond) + passes.length * SCORING.pointsPerBarrier,
    );
  });

  it('anuncia novo recorde uma única vez por partida', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.best, '3');
    const e = new GameEngine({ storage, seed: 8 });
    const records: number[] = [];
    e.on((ev) => ev.type === 'newRecord' && records.push(ev.score));
    e.start();
    for (let i = 0; i < 120 * 15; i++) {
      cheat(e);
      e.advance(dt);
    }
    expect(records).toHaveLength(1);
    expect(records[0]).toBeGreaterThan(3);
  });
});

describe('Persistência do recorde', () => {
  it('salva localmente e o recorde sobrevive a um “recarregamento”', () => {
    const storage = new MemoryStorage();
    const s1 = new ScoreManager(storage);
    s1.reset();
    s1.addTime(12.5);
    s1.addBarrier();
    const r = s1.finish();
    expect(r.isNewRecord).toBe(false); // primeira partida: sem recorde anterior para superar
    expect(storage.getItem(STORAGE_KEYS.best)).toBe(String(17));
    const s2 = new ScoreManager(storage); // nova “página”
    expect(s2.best).toBe(17);
    s2.reset();
    s2.addTime(3);
    const r2 = s2.finish();
    expect(r2.isNewRecord).toBe(false);
    expect(r2.best).toBe(17);
    const s3 = new ScoreManager(storage);
    s3.reset();
    s3.addTime(30);
    expect(s3.finish()).toEqual({ score: 30, best: 30, isNewRecord: true });
    expect(new ScoreManager(storage).best).toBe(30);
  });

  it('valores corrompidos no armazenamento são ignorados', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.best, 'abc');
    expect(new ScoreManager(storage).best).toBe(0);
    storage.setItem(STORAGE_KEYS.best, '-5');
    expect(new ScoreManager(storage).best).toBe(0);
  });

  it('armazenamento que lança erro (modo privado, cota) não impede jogar', () => {
    const broken: Storage = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };
    const e = new GameEngine({ storage: new SafeStorage(broken), seed: 4, lives: 0 });
    e.start();
    for (let i = 0; i < 240; i++) {
      cheat(e);
      e.advance(dt);
    }
    e.obstacles.barriers[0].x = BALL_X;
    e.ball.y = 0;
    e.advance(dt);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.score.best).toBeGreaterThan(0); // recorde vale ao menos na sessão
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    // Até mesmo um Storage “cru” que lança erro é tolerado pelo ScoreManager.
    expect(() => new ScoreManager(broken).finish()).not.toThrow();
  });
});
