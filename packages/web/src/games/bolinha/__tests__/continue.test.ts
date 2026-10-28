import { describe, expect, it } from 'vitest';
import { BALL_X, CONTINUES, PHYSICS, STORAGE_KEYS } from '../game/config';
import { GameEngine } from '../game/GameEngine';
import { MemoryStorage } from '../game/ScoreManager';
import { GameState } from '../game/types';

const dt = PHYSICS.fixedDt;

/** Mantém a bolinha no vão da próxima barreira (joga "perfeito"). */
function cheat(e: GameEngine) {
  const b = e.obstacles.barriers.find((b) => b.x + b.width > e.ball.x - 14);
  if (b) {
    e.ball.y = (b.gapTop + b.gapBottom) / 2;
    e.ball.vy = 0;
  }
}

function play(e: GameEngine, steps: number) {
  for (let i = 0; i < steps; i++) {
    cheat(e);
    e.advance(dt);
  }
}

/** Força uma batida na barreira mais próxima. */
function crash(e: GameEngine) {
  const b = e.obstacles.barriers[0];
  b.x = BALL_X - b.width / 2;
  e.ball.y = b.gapTop - 30;
  e.ball.vy = 0;
  e.advance(dt);
}

function waitCountdown(e: GameEngine) {
  for (let i = 0; i < 200 && e.state === GameState.RESUMING; i++) e.advance(0.05);
}

describe('Continuar de onde parou', () => {
  it('a partida começa com 3 vidas', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    expect(CONTINUES.lives).toBe(3);
    e.start();
    expect(e.livesLeft).toBe(3);
  });

  it('bater com vida sobrando oferece continuar, sem encerrar a partida', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    const events: string[] = [];
    e.on((ev) => events.push(ev.type === 'state' ? `state:${ev.state}` : ev.type));
    e.start();
    play(e, 600);
    crash(e);
    expect(e.state).toBe(GameState.CONTINUE);
    expect(events).toContain('crash');
    expect(events).not.toContain(`state:${GameState.GAME_OVER}`);
  });

  it('continuar mantém pontos e tempo, gasta uma vida e abre espaço à frente', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 2 });
    e.start();
    play(e, 900);
    crash(e);
    const score = e.score.score;
    const elapsed = e.elapsed;
    const runId = e.runId;
    expect(score).toBeGreaterThan(0);

    expect(e.continueRun()).toBe(true);
    expect(e.livesLeft).toBe(2);
    expect(e.state).toBe(GameState.RESUMING);
    expect(e.score.score).toBe(score);
    expect(e.elapsed).toBe(elapsed); // mesma dificuldade de antes
    expect(e.runId).toBe(runId); // mesma partida (ranking envia uma vez só, no fim)
    expect(e.ball.vy).toBe(0);
    // nenhuma barreira em cima ou logo à frente da bolinha
    expect(e.obstacles.barriers.every((b) => b.x >= BALL_X + CONTINUES.clearAhead)).toBe(true);
    // bolinha alinhada ao vão da próxima barreira
    const next = e.obstacles.barriers[0];
    if (next) expect(e.ball.y).toBeCloseTo((next.gapTop + next.gapBottom) / 2, 5);

    waitCountdown(e);
    expect(e.state).toBe(GameState.PLAYING);
    play(e, 240);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.score.score).toBeGreaterThan(score); // a pontuação volta a contar
  });

  it('depois das 3 vidas, a próxima batida encerra; a nova partida começa do zero', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 3 });
    e.start();
    for (let life = 3; life >= 1; life--) {
      play(e, 300);
      crash(e);
      expect(e.state).toBe(GameState.CONTINUE);
      expect(e.livesLeft).toBe(life);
      e.continueRun();
      waitCountdown(e);
    }
    expect(e.livesLeft).toBe(0);
    play(e, 300);
    const before = e.score.score;
    crash(e);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.continueRun()).toBe(false);
    expect(e.score.score).toBe(before);

    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.score.score).toBe(0);
    expect(e.elapsed).toBe(0);
    expect(e.livesLeft).toBe(3);
  });

  it('encerrar na tela de continuar termina a partida com a pontuação atual', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 4 });
    e.start();
    play(e, 600);
    crash(e);
    const score = e.score.score;
    e.endRun();
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.score.score).toBe(score);
    expect(e.continueRun()).toBe(false);
  });

  it('o recorde é salvo já na batida e o novo recorde depois de continuar também', () => {
    const storage = new MemoryStorage();
    const e = new GameEngine({ storage, seed: 5 });
    e.start();
    play(e, 600);
    crash(e);
    const first = Number(storage.getItem(STORAGE_KEYS.best));
    expect(first).toBe(e.score.score);
    e.continueRun();
    waitCountdown(e);
    play(e, 600);
    crash(e);
    expect(Number(storage.getItem(STORAGE_KEYS.best))).toBeGreaterThan(first);
  });

  it('continuar só funciona na tela de continuar', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 6 });
    expect(e.continueRun()).toBe(false);
    e.start();
    expect(e.continueRun()).toBe(false);
    e.pause();
    expect(e.continueRun()).toBe(false);
    expect(e.livesLeft).toBe(3);
  });

  it('pausar durante a contagem depois de continuar funciona', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 7 });
    e.start();
    play(e, 300);
    crash(e);
    e.continueRun();
    e.pause();
    expect(e.state).toBe(GameState.PAUSED);
    e.resume();
    waitCountdown(e);
    expect(e.state).toBe(GameState.PLAYING);
  });

  it('sem vidas configuradas (lives: 0) a batida encerra direto', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 8, lives: 0 });
    e.start();
    play(e, 300);
    crash(e);
    expect(e.state).toBe(GameState.GAME_OVER);
  });
});
