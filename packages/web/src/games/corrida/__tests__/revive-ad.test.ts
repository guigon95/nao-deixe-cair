import { describe, expect, it } from 'vitest';
import { CONTINUES, SIM } from '../game/config';
import { Engine } from '../game/Engine';
import { GameState, type GameEvent } from '../game/types';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;

function engine(seed: number, lives: number, adRevives: number) {
  const e = new Engine({ storage: new MemoryStorage(), seed, resumeDelay: 0, lives, adRevives });
  const events: GameEvent[] = [];
  e.on((ev) => events.push(ev));
  return { e, events };
}

const runUntilStop = (e: Engine) => {
  for (let i = 0; i < 120 * 60 && e.state === GameState.PLAYING; i++) e.step(DT);
};

/** Gasta todas as vidas grátis e para na batida seguinte. */
function exhaustLives(e: Engine) {
  e.start();
  for (let k = 0; k < e.lives; k++) {
    runUntilStop(e);
    expect(e.continueRun()).toBe(true);
  }
  runUntilStop(e);
}

describe('revive por anúncio (motor)', () => {
  it('sem revive configurado (anúncios desligados): igual a antes — vidas acabam, fim de partida', () => {
    const { e } = engine(4, CONTINUES.lives, 0);
    exhaustLives(e);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.lastChance).toBe(false);
    expect(e.reviveWithReward()).toBe(false);
  });

  it('vidas grátis continuam grátis e não gastam o revive', () => {
    const { e } = engine(4, 3, 1);
    e.start();
    runUntilStop(e);
    expect(e.state).toBe(GameState.CONTINUE);
    expect(e.lastChance).toBe(false);
    // Revive pago não vale enquanto há vida grátis.
    expect(e.reviveWithReward()).toBe(false);
    expect(e.continueRun()).toBe(true);
    expect(e.adRevivesLeft).toBe(1);
  });

  it('sem vidas: tela de última chance (sem encerrar a partida nem gravar fim)', () => {
    const { e, events } = engine(4, 3, 1);
    exhaustLives(e);
    expect(e.state).toBe(GameState.CONTINUE);
    expect(e.lastChance).toBe(true);
    expect(events.some((ev) => ev.type === 'state' && ev.state === GameState.GAME_OVER)).toBe(false);
    const death = events.filter((ev) => ev.type === 'death').pop();
    expect(death && death.type === 'death' && death.livesLeft).toBe(0);
    expect(death && death.type === 'death' && death.adRevivesLeft).toBe(1);
  });

  it('continuar grátis não funciona na última chance (só a recompensa revive)', () => {
    const { e } = engine(4, 3, 1);
    exhaustLives(e);
    expect(e.continueRun()).toBe(false);
    expect(e.state).toBe(GameState.CONTINUE);
  });

  it('revive mantém pontos, distância e tempo; capivara em lugar seguro; a partida segue', () => {
    const { e, events } = engine(4, 3, 1);
    exhaustLives(e);
    const before = { score: e.score.score, meters: e.score.meters, elapsed: e.elapsed, x: e.runner.x, runId: e.runId, fruits: e.score.fruits };
    expect(e.reviveWithReward()).toBe(true);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.runId).toBe(before.runId); // mesma partida, não reiniciou
    expect(e.score.score).toBe(before.score);
    expect(e.score.meters).toBe(before.meters);
    expect(e.score.fruits).toBe(before.fruits);
    expect(e.elapsed).toBe(before.elapsed);
    expect(e.runner.x).toBe(before.x);
    expect(e.runner.grounded).toBe(true);
    expect(e.track.level.groundAt(e.runner.x)).toBe(true);
    expect(e.swarm).toBeGreaterThanOrEqual(CONTINUES.swarm);
    const cont = events.filter((ev) => ev.type === 'continue').pop();
    expect(cont && cont.type === 'continue' && cont.via).toBe('ad');
    // Corre o trecho limpo sem bater e volta a pontuar.
    for (let i = 0; i < 120 * (CONTINUES.clearAhead - 0.2) && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.score.score).toBeGreaterThan(before.score);
  });

  it('uma revivida por partida: a próxima batida encerra de vez; revive repetido é ignorado', () => {
    const { e, events } = engine(4, 3, 1);
    exhaustLives(e);
    expect(e.reviveWithReward()).toBe(true);
    expect(e.reviveWithReward()).toBe(false);
    runUntilStop(e);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.reviveWithReward()).toBe(false);
    expect(events.filter((ev) => ev.type === 'state' && ev.state === GameState.GAME_OVER)).toHaveLength(1);
  });

  it('desistir na última chance encerra; nova partida devolve vidas e revive', () => {
    const { e } = engine(4, 3, 1);
    exhaustLives(e);
    e.endRun();
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.reviveWithReward()).toBe(false);
    e.start();
    expect(e.livesLeft).toBe(3);
    expect(e.adRevivesLeft).toBe(1);
  });

  it('sem vidas grátis (lives 0) e com revive: primeira batida já é a última chance', () => {
    const { e } = engine(1, 0, 1);
    e.start();
    runUntilStop(e);
    expect(e.lastChance).toBe(true);
    expect(e.reviveWithReward()).toBe(true);
  });
});
