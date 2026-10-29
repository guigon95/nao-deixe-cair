import { describe, expect, it } from 'vitest';
import { ITEMS, MAGNET, SIM } from '../game/config';
import { Engine } from '../game/Engine';
import { Track } from '../game/Track';
import { GameState, type GameEvent } from '../game/types';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;

function freshEngine() {
  const e = new Engine({ storage: new MemoryStorage(), seed: 3, lives: 0, resumeDelay: 0 });
  const events: GameEvent[] = [];
  e.on((ev) => events.push(ev));
  e.start();
  // Trecho limpo e plano à frente para testar sem obstáculos.
  const l = e.track.level;
  l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = l.vines.length = 0;
  l.fruits.length = l.powerups.length = 0;
  l.ground.length = 0;
  l.addGround(-800, 20_000);
  e.track.genX = 20_000;
  return { e, events, l };
}

describe('ímã de capim', () => {
  it('pegar o ímã liga por alguns segundos e desliga sozinho', () => {
    const { e, events, l } = freshEngine();
    l.powerups.push({ x: e.runner.x + 60, y: 17, kind: 'magnet', taken: false });
    for (let i = 0; i < 60; i++) e.step(DT);
    expect(e.magnet).toBeGreaterThan(MAGNET.duration - 1);
    expect(events.some((ev) => ev.type === 'magnet' && ev.on)).toBe(true);
    for (let i = 0; i < Math.ceil(MAGNET.duration / DT) + 10; i++) e.step(DT);
    expect(e.magnet).toBe(0);
    expect(events.some((ev) => ev.type === 'magnet' && !ev.on)).toBe(true);
  });

  it('com o ímã, capins fora do caminho (alto e à frente) são comidos sem pular', () => {
    const { e, l } = freshEngine();
    e.magnet = MAGNET.duration;
    const x = e.runner.x;
    for (let k = 0; k < 6; k++) l.fruits.push({ x: x + 100 + k * 25, y: 150, taken: false, risky: false });
    for (let i = 0; i < 120 * 2; i++) e.step(DT);
    expect(e.score.fruits).toBe(6);
    expect(e.state).toBe(GameState.PLAYING);
  });

  it('sem o ímã, os mesmos capins altos ficam para trás', () => {
    const { e, l } = freshEngine();
    const x = e.runner.x;
    for (let k = 0; k < 6; k++) l.fruits.push({ x: x + 100 + k * 25, y: 150, taken: false, risky: false });
    for (let i = 0; i < 120 * 2; i++) e.step(DT);
    expect(e.score.fruits).toBe(0);
  });

  it('cada capim puxado conta uma vez e enche o medidor', () => {
    const { e, l } = freshEngine();
    e.magnet = MAGNET.duration;
    for (let k = 0; k < 12; k++) l.fruits.push({ x: e.runner.x + 40 + k * 15, y: 40 + (k % 3) * 40, taken: false, risky: false });
    for (let i = 0; i < 120 * 2; i++) e.step(DT);
    expect(e.score.fruits).toBe(12);
    expect(e.meterFull).toBe(true);
  });

  it('o gerador põe itens de vez em quando, nunca no começo e com intervalo mínimo', () => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const t = new Track(createRng(seed));
      const seen: number[] = [];
      for (let x = 0; x < 400 * 150; x += 200) {
        const before = t.level.powerups.length;
        t.update(x, x / 400, 400);
        for (let i = before; i < t.level.powerups.length; i++) seen.push(t.history[t.history.length - 1].t);
      }
      total += seen.length;
      for (const s of seen) expect(s).toBeGreaterThanOrEqual(ITEMS.firstAfter);
      for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(ITEMS.minGap - 1e-6);
    }
    // ~150 s por partida: em média uns 4–8 itens.
    expect(total / 20).toBeGreaterThan(2);
    expect(total / 20).toBeLessThan(10);
  });

  it('nova partida começa sem ímã', () => {
    const { e } = freshEngine();
    e.magnet = 5;
    e.pause();
    e.start();
    expect(e.magnet).toBe(0);
  });

  it('embalo: +10% de velocidade com o ímã, subindo e descendo suave, sem afastar o enxame', () => {
    const { e, l } = freshEngine();
    const v0 = e.runSpeed;
    e.swarm = 200;
    l.powerups.push({ x: e.runner.x + 40, y: 17, kind: 'magnet', taken: false });
    for (let i = 0; i < 30; i++) e.step(DT);
    expect(e.speedFactor).toBeGreaterThan(1);
    expect(e.speedFactor).toBeLessThan(1 + MAGNET.boost);
    for (let i = 0; i < 120; i++) e.step(DT);
    expect(e.speedFactor).toBeCloseTo(1 + MAGNET.boost, 2);
    expect(e.runSpeed / v0).toBeGreaterThan(1.09);
    expect(e.runSpeed / v0).toBeLessThan(1.12);
    // O enxame não fica para trás por causa do embalo (só o descanso normal o afasta).
    expect(e.swarm).toBeLessThanOrEqual(200 + 40 * 1.5 + 1);
    for (let i = 0; i < Math.ceil((MAGNET.duration + 1) / DT); i++) e.step(DT);
    expect(e.speedFactor).toBe(1);
  });
});

