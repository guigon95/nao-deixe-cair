import { describe, expect, it } from 'vitest';
import { SPEED } from '../game/config';
import { Level } from '../game/Level';
import { createRunner, stepRunner } from '../game/Physics';
import { byId } from '../game/Track';
import { airTime, Builder, CANOPY, HOLD_FULL, HOLD_TAP, jumpHeightAt, PATTERNS, SIZES } from '../game/patterns';
import { planRoute } from '../game/testing/planner';
import { createRng } from '../../../shared/random';

const SPEEDS = [SPEED.start, (SPEED.start + SPEED.max) / 2, SPEED.max];
const X0 = 600;

/** Monta só um padrão, com chão antes e depois (como o gerador faz). */
function single(build: (b: Builder) => number, v: number, seed = 1) {
  const level = new Level();
  const b = new Builder(level, X0, v, createRng(seed), 1);
  const dur = build(b);
  let cursor = -400;
  for (const [a, z] of [...b.pits].sort((p, q) => p[0] - q[0])) {
    level.addGround(cursor, a);
    cursor = z;
  }
  const end = X0 + (dur + 0.6 + 0.4) * v;
  level.addGround(cursor, end + 400);
  level.fruits.sort((p, q) => p.x - q.x);
  return { level, goal: end };
}

describe('padrões de obstáculos', () => {
  it('pulo segurado e toque curto têm alturas e tempos distintos', () => {
    expect(airTime(HOLD_FULL)).toBeGreaterThan(0.6);
    expect(airTime(HOLD_FULL)).toBeLessThan(0.75);
    expect(airTime(HOLD_TAP)).toBeLessThan(airTime(HOLD_FULL) - 0.15);
  });

  for (const p of PATTERNS) {
    for (const v of SPEEDS) {
      it(`"${p.id}" é atravessável a ${Math.round(v)} u/s sem bater em caixote`, () => {
        for (const seed of [1, 2, 3]) {
          const { level, goal } = single((b) => p.build(b), v, seed);
          const plan = planRoute(level, createRunner(0), { goalX: goal, elapsed: 0, fixedSpeed: v, maxJumps: 6 });
          expect(plan, `semente ${seed}`).not.toBeNull();
        }
      });
    }
  }

  it('o planejador recusa um rio impossível (não aprova tudo)', () => {
    const { level, goal } = single((b) => {
      b.pit(0, 2.2);
      return 2.2;
    }, SPEED.start);
    expect(planRoute(level, createRunner(0), { goalX: goal, elapsed: 0, fixedSpeed: SPEED.start })).toBeNull();
  });

  it('o planejador recusa uma pedra mais alta que o pulo', () => {
    const { level, goal } = single((b) => {
      b.level.rocks.push({ x0: b.X(0), x1: b.X(0) + 30, top: 400, variant: 0, broken: false });
      return 0.1;
    }, SPEED.start);
    expect(planRoute(level, createRunner(0), { goalX: goal, elapsed: 0, fixedSpeed: SPEED.start })).toBeNull();
  });

  it('obstáculos cabem sob o pulo: pedras e espinhos são mais baixos que o pulo curto', () => {
    // Pulo curto (~85 u) passa pela pedra pequena e pelos espinhos; a pedra grande pede segurar.
    const apex = (hold: number) => Math.max(...Array.from({ length: 120 }, (_, i) => jumpHeightAt(i / 120, hold)));
    const tap = apex(HOLD_TAP);
    const full = apex(HOLD_FULL);
    expect(tap).toBeGreaterThan(SIZES.rockSmall.h + 20);
    expect(tap).toBeLessThan(SIZES.rockBig.h + 50);
    expect(full).toBeGreaterThan(140);
    expect(full).toBeLessThan(180);
  });

  it('todo padrão só usa níveis existentes e tem peso positivo', () => {
    const ids = new Set<string>();
    for (const p of PATTERNS) {
      expect(p.tier).toBeGreaterThanOrEqual(0);
      expect(p.tier).toBeLessThanOrEqual(4);
      expect(p.weight).toBeGreaterThan(0);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
    // Cada nível libera algo novo.
    for (let t = 0; t <= 4; t++) expect(PATTERNS.some((p) => p.tier === t)).toBe(true);
  });

  it('copa das árvores: pular no cipó sempre leva à copa, e o caminho de baixo é seguro', () => {
    for (const v of SPEEDS) {
      let grabs = 0;
      let reached = 0;
      for (let at = 0; at < 120; at += 3) {
        for (const hold of [1, 24, 80]) {
          const { level } = single((b) => byId('copa').build(b), v);
          const r = createRunner(X0 - 0.5 * v);
          let grabbed = false;
          let up = false;
          let death = null;
          for (let i = 0; i < 400 && !death; i++) {
            death = stepRunner(r, { hold: i >= at && i < at + hold, pressed: i === at, drop: false }, level, v, 1 / 120);
            if (r.swinging) grabbed = true;
            if (r.grounded && Math.abs(r.y - CANOPY.y) < 0.5) up = true;
          }
          if (grabbed) {
            grabs++;
            if (up) reached++;
          }
        }
      }
      expect(grabs).toBeGreaterThan(5);
      expect(reached).toBe(grabs);
    }
    // Embaixo da copa não há nada que mate: só chão, caixotes e capim.
    const { level } = single((b) => byId('copa').build(b), SPEED.max);
    expect(level.rocks.length + level.thorns.length).toBe(0);
    expect(level.ground).toHaveLength(1);
  });
});

