import { describe, expect, it } from 'vitest';
import { LOG, SIM, SPEED } from '../game/config';
import { Engine } from '../game/Engine';
import { Level, logMeet, logX } from '../game/Level';
import { createRunner, stepRunner, type StepSink } from '../game/Physics';
import { Builder } from '../game/patterns';
import { planRoute } from '../game/testing/planner';
import { GameState, type GameEvent } from '../game/types';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;

function flat() {
  const e = new Engine({ storage: new MemoryStorage(), seed: 4, lives: 0, resumeDelay: 0 });
  const events: GameEvent[] = [];
  e.on((ev) => events.push(ev));
  e.start();
  const l = e.track.level;
  l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = l.vines.length = 0;
  l.fruits.length = l.powerups.length = l.logs.length = 0;
  l.ground.length = 0;
  l.addGround(-800, 40_000);
  e.track.genX = 40_000;
  return { e, l, events };
}

const run = (e: Engine, s: number) => {
  for (let i = 0; i < s / DT && e.state === GameState.PLAYING; i++) e.step(DT);
};

/** Tora que encontra a capivara daqui a `t` s (na velocidade atual). */
function logAhead(e: Engine, t: number) {
  const b = new Builder(e.track.level, e.runner.x, e.speed, createRng(1));
  b.log(t);
}

describe('tora rolando', () => {
  it('fica parada até a capivara chegar perto e então rola na direção dela', () => {
    const l = { x0: 1000, trig: 400, k: LOG.k, r: LOG.r, broken: false, rolling: false, passed: false };
    expect(logX(l, 0)).toBe(1000);
    expect(logX(l, 400)).toBe(1000);
    expect(logX(l, 500)).toBeCloseTo(1000 - LOG.k * 100);
    // Encontro: centro da tora = x da capivara.
    const m = logMeet(l);
    expect(logX(l, m)).toBeCloseTo(m);
  });

  it('sem pular, a tora atropela', () => {
    const { e } = flat();
    logAhead(e, 1.5);
    run(e, 3);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.deathCause).toBe('log');
  });

  it('um toque curto na hora certa passa por cima e conta como desvio', () => {
    for (const v of [SPEED.start, SPEED.max]) {
      const level = new Level();
      level.addGround(-800, 40_000);
      const b = new Builder(level, 0, v, createRng(1));
      b.log(2);
      const plan = planRoute(level, createRunner(0), { goalX: 4 * v, elapsed: 0, fixedSpeed: v, maxJumps: 2 });
      expect(plan, `${v}`).not.toBeNull();
    }
    const { e, events } = flat();
    logAhead(e, 1.2);
    // Pula um pouco antes do encontro.
    run(e, 1.2 - 0.22);
    e.setHolding(true);
    run(e, 0.05);
    e.setHolding(false);
    run(e, 1.5);
    expect(e.state).toBe(GameState.PLAYING);
    expect(events.some((ev) => ev.type === 'log' && ev.phase === 'roll')).toBe(true);
    expect(events.some((ev) => ev.type === 'log' && ev.phase === 'dodge')).toBe(true);
  });

  it('caindo em cima da tora, a capivara quica e a tora quebra', () => {
    const level = new Level();
    level.addGround(-800, 40_000);
    level.logs.push({ x0: 100, trig: -1000, k: 0, r: LOG.r, broken: false, rolling: true, passed: false });
    const r = createRunner(100);
    r.y = r.prevY = 2 * LOG.r + 1;
    r.grounded = false;
    r.vy = -300;
    let smashed = 0;
    const sink = { jump() {}, land() {}, crate() {}, smash: (o: { broken: boolean }) => { o.broken = true; smashed++; }, spring() {}, fruit() {}, grab() {}, letGo() {} } as unknown as StepSink;
    const death = stepRunner(r, { hold: false, pressed: false, drop: false }, level, 300, DT, sink);
    expect(death).toBeNull();
    expect(smashed).toBe(1);
    expect(r.vy).toBeGreaterThan(0);
  });

  it('a Disparada quebra a tora', () => {
    const { e, events } = flat();
    logAhead(e, 1);
    run(e, 0.6);
    e.meter = 12;
    e.dash();
    run(e, 1);
    expect(e.state).toBe(GameState.PLAYING);
    expect(events.some((ev) => ev.type === 'smash')).toBe(true);
  });

  it('o escudo segura uma tora', () => {
    const { e } = flat();
    e.shield = true;
    logAhead(e, 1);
    run(e, 2);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.shield).toBe(false);
  });

  it('continuar perto de uma tora tira a tora do caminho', () => {
    const { e, l } = flat();
    logAhead(e, 1);
    expect(l.logs).toHaveLength(1);
    l.clearZone(e.runner.x - 200, e.runner.x + e.speed * 1.8);
    expect(l.logs).toHaveLength(0);
  });
});
