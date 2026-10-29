import { describe, expect, it } from 'vitest';
import { CONTINUES, DASH, SIM, STORAGE, SWARM } from '../game/config';
import { speedAt, tierAt, restAt } from '../game/Difficulty';
import { Engine } from '../game/Engine';
import { SwipeDetector } from '../game/Gestures';
import { Track } from '../game/Track';
import { GameState, type GameEvent } from '../game/types';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../../../shared/storage/storage';
import { GameLoop, type FrameScheduler } from '../../../shared/loop/GameLoop';

const DT = SIM.fixedDt;

function engine(seed = 1, lives = 0) {
  const storage = new MemoryStorage();
  const e = new Engine({ storage, seed, resumeDelay: 0, lives });
  const events: GameEvent[] = [];
  e.on((ev) => events.push(ev));
  return { e, storage, events };
}

describe('motor da partida', () => {
  it('estados: menu → jogando → pausa → jogando → fim → reinício', () => {
    const { e } = engine();
    expect(e.state).toBe(GameState.READY);
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    e.pause();
    expect(e.state).toBe(GameState.PAUSED);
    const x = e.runner.x;
    e.advance(0.5);
    expect(e.runner.x).toBe(x);
    e.resume();
    expect(e.state).toBe(GameState.PLAYING);
    // Sem tocar, a capivara bate no primeiro obstáculo.
    for (let i = 0; i < 120 * 30 && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.state).toBe(GameState.GAME_OVER);
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.runner.x).toBe(0);
    expect(e.elapsed).toBe(0);
    expect(e.score.score).toBe(0);
    expect(e.swarm).toBe(SWARM.start);
    expect(e.meter).toBe(0);
  });

  it('reinício com a mesma semente reproduz o percurso', () => {
    const a = new Engine({ storage: new MemoryStorage(), seed: 42 });
    const b = new Engine({ storage: new MemoryStorage(), seed: 42 });
    a.start();
    b.start();
    for (let i = 0; i < 600; i++) {
      a.step(DT);
      b.step(DT);
    }
    expect(a.track.history.map((h) => h.id)).toEqual(b.track.history.map((h) => h.id));
  });

  it('o avanço por quadro não depende do FPS (passo fixo)', () => {
    const run = (fps: number) => {
      const { e } = engine(3);
      e.start();
      for (let i = 0; i < fps * 1.5; i++) e.advance(1 / fps);
      return e.runner.x;
    };
    expect(Math.abs(run(60) - run(144))).toBeLessThan(6);
  });

  it('quadro enorme (aba voltando) é limitado: sem teleporte', () => {
    const { e } = engine();
    e.start();
    const steps = e.advance(5);
    expect(steps).toBeLessThanOrEqual(Math.ceil(SIM.maxFrameTime / DT) + 1);
  });

  it('caixote atrasa a capivara e o enxame se aproxima; correr afasta de novo', () => {
    const { e } = engine();
    e.start();
    e.swarm = SWARM.rest;
    e.track.level.crates.unshift({ x0: 30, x1: 66, top: 36, broken: false, brokenAt: 0 });
    for (let i = 0; i < 60; i++) e.step(DT);
    expect(e.runner.slow).toBeLessThan(1);
    expect(e.swarm).toBeLessThan(SWARM.rest - 40);
    const low = e.swarm;
    for (let i = 0; i < 240; i++) e.step(DT);
    expect(e.swarm).toBeGreaterThan(low);
  });

  it('o enxame alcança quem é atrasado demais', () => {
    const { e } = engine();
    e.start();
    e.swarm = 10;
    e.runner.slow = 0.2;
    for (let i = 0; i < 60 && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.deathCause).toBe('swarm');
  });

  it('dash só com o medidor cheio; quebra pedra e afasta o enxame', () => {
    const { e, events } = engine();
    e.start();
    expect(e.dash()).toBe(false);
    e.meter = DASH.meterMax;
    e.swarm = 150;
    expect(e.dash()).toBe(true);
    e.track.level.rocks.unshift({ x0: e.runner.x + 40, x1: e.runner.x + 74, top: 30, variant: 0, broken: false });
    for (let i = 0; i < 60; i++) e.step(DT);
    expect(e.state).toBe(GameState.PLAYING);
    expect(events.some((ev) => ev.type === 'dash' && ev.on)).toBe(true);
    expect(e.meter).toBeLessThan(DASH.meterMax);
    expect(events.some((ev) => ev.type === 'smash')).toBe(true);
    expect(e.swarm).toBeGreaterThan(150);
  });

  it('capins enchem o medidor e somam pontos; recorde salvo no fim', () => {
    const { e, storage } = engine();
    e.start();
    for (let i = 0; i < 300 && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.score.fruits).toBeGreaterThan(0); // a fileira do começo fica no caminho
    expect(e.meter).toBe(e.score.fruits);
    for (let i = 0; i < 120 * 30 && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(Number(storage.getItem(STORAGE.best))).toBe(e.score.score);
  });

  it('segurar a tecla não gera pulos repetidos (só a borda do toque pula)', () => {
    const { e, events } = engine();
    e.start();
    e.setHolding(true);
    for (let i = 0; i < 200 && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(events.filter((ev) => ev.type === 'jump').length).toBe(1);
  });
});

describe('dificuldade e geração', () => {
  it('a velocidade sobe, mas tem limite; níveis liberam aos poucos', () => {
    expect(speedAt(0)).toBeLessThan(speedAt(30));
    expect(speedAt(30)).toBeLessThan(speedAt(90));
    expect(speedAt(10_000)).toBeLessThanOrEqual(480);
    expect(tierAt(0)).toBe(0);
    expect(tierAt(12)).toBe(1);
    expect(tierAt(30)).toBe(2);
    expect(tierAt(50)).toBe(3);
    expect(tierAt(200)).toBe(4);
    expect(restAt(200).min).toBeGreaterThan(0.2);
  });

  it('o gerador descarta o que ficou para trás (memória constante)', () => {
    const t = new Track(createRng(9));
    let max = 0;
    for (let x = 0; x < 200_000; x += 200) {
      t.update(x, x / 400, 400);
      max = Math.max(max, t.level.size);
    }
    expect(max).toBeLessThan(250);
  });

  it('o começo é livre de obstáculos', () => {
    const t = new Track(createRng(1));
    t.update(0, 0, speedAt(0));
    const firstHazard = Math.min(
      ...t.level.rocks.map((r) => r.x0),
      ...t.level.thorns.map((r) => r.x0),
      ...t.level.crates.map((r) => r.x0),
      ...t.level.ground.slice(1).map((g) => g.x0),
    );
    expect(firstHazard).toBeGreaterThan(speedAt(0) * 2);
  });
});

describe('gestos', () => {
  it('deslizar para baixo e para a direita; lento ou curto não conta', () => {
    const s = new SwipeDetector();
    s.down(1, 100, 100, 0);
    expect(s.move(1, 102, 120, 0.05)).toBeNull();
    expect(s.move(1, 104, 150, 0.1)).toBe('drop');
    expect(s.move(1, 104, 200, 0.12)).toBeNull(); // um gesto, uma ação
    s.down(2, 100, 100, 1);
    expect(s.move(2, 160, 105, 1.1)).toBe('dash');
    s.down(3, 100, 100, 2);
    expect(s.move(3, 100, 160, 2.6)).toBeNull();
  });
});

describe('laço compartilhado', () => {
  it('reiniciar não cria um segundo laço', () => {
    const scheduler: FrameScheduler = { request: () => 1, cancel: () => {} };
    const loop = new GameLoop(() => {}, scheduler);
    loop.start();
    loop.start();
    expect(loop.activeLoops).toBe(1);
    loop.stop();
    expect(loop.activeLoops).toBe(0);
  });
});

describe('vidas e continuar', () => {
  const runUntilStop = (e: Engine) => {
    for (let i = 0; i < 120 * 60 && e.state === GameState.PLAYING; i++) e.step(DT);
  };

  it('com vida sobrando, bater leva à tela de continuar; sem vida, ao fim', () => {
    const { e, events } = engine(1, 3);
    e.start();
    expect(e.livesLeft).toBe(CONTINUES.lives);
    runUntilStop(e);
    expect(e.state).toBe(GameState.CONTINUE);
    const death = events.find((ev) => ev.type === 'death');
    expect(death && death.type === 'death' && death.livesLeft).toBe(3);
  });

  it('continuar mantém pontos, tempo e medidor; limpa o caminho e afasta o enxame', () => {
    const { e } = engine(2, 3);
    e.start();
    runUntilStop(e);
    const before = { score: e.score.score, elapsed: e.elapsed, meter: e.meter, x: e.runner.x };
    expect(e.continueRun()).toBe(true);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.livesLeft).toBe(2);
    expect(e.score.score).toBe(before.score);
    expect(e.elapsed).toBe(before.elapsed);
    expect(e.meter).toBe(before.meter);
    expect(e.runner.x).toBe(before.x);
    expect(e.runner.grounded).toBe(true);
    expect(e.swarm).toBeGreaterThanOrEqual(CONTINUES.swarm);
    // Sem tocar, corre pelo trecho limpo sem bater.
    const clear = e.speed * CONTINUES.clearAhead;
    for (let i = 0; i < 120 * 30 && e.state === GameState.PLAYING && e.runner.x < before.x + clear - 40; i++) e.step(DT);
    expect(e.state).toBe(GameState.PLAYING);
    // E os pontos voltam a contar.
    expect(e.score.score).toBeGreaterThan(before.score);
  });

  it('continuar depois de cair no rio põe chão embaixo e não deixa meio rio à frente', () => {
    const { e } = engine(3, 3);
    e.start();
    e.track.level.ground.length = 0;
    e.track.level.addGround(-800, 300);
    e.track.level.addGround(1400, 9000);
    e.track.level.rocks.length = e.track.level.thorns.length = e.track.level.crates.length = 0;
    runUntilStop(e);
    expect(e.deathCause).toBe('river');
    e.continueRun();
    expect(e.track.level.groundAt(e.runner.x)).toBe(true);
    for (let i = 0; i < 120 * 6 && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.state).toBe(GameState.PLAYING);
  });

  it('3 vidas: na quarta batida a partida acaba de vez; um só envio por partida', () => {
    const { e, events } = engine(4, 3);
    e.start();
    for (let k = 0; k < 3; k++) {
      runUntilStop(e);
      expect(e.state).toBe(GameState.CONTINUE);
      e.continueRun();
    }
    runUntilStop(e);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.continueRun()).toBe(false);
    expect(events.filter((ev) => ev.type === 'state' && ev.state === GameState.GAME_OVER)).toHaveLength(1);
  });

  it('encerrar na tela de continuar termina a partida; nova partida volta com 3 vidas', () => {
    const { e } = engine(5, 3);
    e.start();
    runUntilStop(e);
    e.endRun();
    expect(e.state).toBe(GameState.GAME_OVER);
    e.start();
    expect(e.livesLeft).toBe(3);
  });
});

