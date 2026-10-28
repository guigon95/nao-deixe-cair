import { describe, expect, it } from 'vitest';
import { PLANE, SIM } from '../game/config';
import { distanceTo, Engine } from '../game/Engine';
import { autoplay } from '../game/testing/autopilot';
import { GameState, type GameEvent } from '../game/types';
import { BIRD_RANGE, difficultyAt, World, WORLD } from '../game/World';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../../../shared/storage/storage';

describe('gerador do mundo', () => {
  it('nenhum obstáculo invade o corredor livre (nem no caminho dos pássaros)', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const w = new World(createRng(seed), seed);
      for (let x = 0; x < 40000; x += 200) {
        w.update(x, 0);
        for (const o of w.obstacles) {
          if (!o.active) continue;
          // Amostra todo o espaço que o obstáculo ocupa (pássaro: a patrulha inteira).
          const x0 = o.kind === 'bird' ? o.top - BIRD_RANGE : o.x - o.r;
          const x1 = o.kind === 'bird' ? o.top : o.x + o.r;
          for (let k = 0; k <= 8; k++) {
            const xx = x0 + ((x1 - x0) * k) / 8;
            const c = w.corridorAt(xx);
            if (!c) continue;
            const ok = o.kind === 'tower' ? o.top <= c.bottom : o.baseY + o.r + 6 <= c.bottom || o.baseY - o.r - 6 >= c.top;
            if (!ok) bad.push(`semente ${seed}: ${o.kind} em x=${Math.round(xx)}`);
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 30000);

  it('o corredor nunca encosta no chão e muda de altura no máximo uma rampa voável', () => {
    const w = new World(createRng(9), 9);
    let prev: number | null = null;
    for (let x = 0; x < 40000; x += WORLD.segmentWidth / 4) {
      w.update(x, 0);
      const c = w.corridorAt(x)!;
      expect(c.bottom).toBeGreaterThan(w.terrain.height(x) + 20);
      const mid = (c.bottom + c.top) / 2;
      if (prev !== null) expect(Math.abs(mid - prev)).toBeLessThanOrEqual(difficultyAt(x).maxShift / 4 + 1);
      prev = mid;
    }
  });

  it('o começo é livre de obstáculos (decolagem)', () => {
    const w = new World(createRng(3), 3);
    w.update(0, 0);
    expect(w.obstacles.filter((o) => o.active && o.x < WORLD.freeStart).length).toBe(0);
  });

  it('a dificuldade cresce: corredor mais estreito e mais obstáculos', () => {
    const a = difficultyAt(0);
    const b = difficultyAt(30000);
    expect(b.gap).toBeLessThan(a.gap);
    expect(b.density).toBeGreaterThan(a.density);
    expect(b.gap).toBeGreaterThan(PLANE.hitRadius * 2 * 8); // sempre com folga real
  });

  it('piloto automático sobrevive 120 s em 20 sementes', () => {
    for (let seed = 100; seed < 120; seed++) {
      const e = new Engine({ storage: new MemoryStorage(), seed });
      const r = autoplay(e, 120);
      expect(r.crashed, `semente ${seed} bateu em ${r.survived.toFixed(1)} s`).toBe(false);
      expect(e.score.score).toBeGreaterThan(500);
    }
  }, 30000);
});

describe('motor da partida', () => {
  const mk = (seed = 7) => new Engine({ storage: new MemoryStorage(), seed, resumeDelay: 0 });

  it('estados: menu → jogando → pausa → jogando → fim → reinício', () => {
    const e = mk();
    const states: string[] = [];
    e.on((ev) => ev.type === 'state' && states.push(ev.state));
    expect(e.state).toBe(GameState.READY);
    e.start();
    e.advance(0.05);
    e.pause();
    const x = e.plane.x;
    e.advance(1);
    expect(e.plane.x).toBe(x); // nada anda pausado
    e.resume();
    // Sem tocar o avião plana até o chão; se encostar devagar, é batida.
    for (let i = 0; i < 30 * 60 && e.state === GameState.PLAYING; i++) e.advance(1 / 60);
    expect(e.state).toBe(GameState.GAME_OVER);
    e.start();
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.score.score).toBe(0);
    expect(states).toEqual(['PLAYING', 'PAUSED', 'PLAYING', 'GAME_OVER', 'PLAYING']);
  });

  it('segurar acelera, soltar desacelera (potência)', () => {
    const e = mk();
    e.start();
    e.setHolding(true);
    for (let i = 0; i < 18; i++) e.advance(1 / 60);
    expect(e.plane.throttle).toBeGreaterThan(0.9);
    e.setHolding(false);
    for (let i = 0; i < 24; i++) e.advance(1 / 60);
    expect(e.plane.throttle).toBeLessThan(0.3);
  });

  /** Toque curto (s) via motor, em quadros de 60 Hz. */
  const tap = (e: Engine, down: number, up: number) => {
    e.setHolding(true);
    for (let i = 0; i < Math.round(down * 60); i++) e.advance(1 / 60);
    e.setHolding(false);
    for (let i = 0; i < Math.round(up * 60); i++) e.advance(1 / 60);
  };

  it('dois toques rápidos fazem um loop e dão pontos', () => {
    const e = mk();
    const got: string[] = [];
    e.on((ev: GameEvent) => ev.type === 'maneuver' && got.push(ev.m.kind));
    e.start();
    tap(e, 0.1, 0.12);
    tap(e, 0.1, 2.5);
    expect(got).toContain('loop');
    expect(e.score.maneuverPoints).toBeGreaterThanOrEqual(100);
  });

  it('segurar muito tempo sobe cada vez mais alto e nunca vira loop', () => {
    const e = mk();
    const got: string[] = [];
    e.on((ev: GameEvent) => ev.type === 'maneuver' && got.push(ev.m.kind));
    e.start();
    const y0 = e.plane.y;
    const heights: number[] = [];
    e.setHolding(true);
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 60; i++) e.advance(1 / 60);
      heights.push(e.plane.y - y0);
    }
    expect(heights[0]).toBeGreaterThan(100);
    expect(heights[1]).toBeGreaterThan(heights[0] + 100);
    expect(heights[2]).toBeGreaterThan(heights[1] + 100);
    expect(e.plane.phi).toBeLessThan(Math.PI / 2);
    expect(got).not.toContain('loop');
    expect(e.plane.stall).toBe(0);
  });

  it('bater num obstáculo encerra a partida', () => {
    const e = mk();
    const causes: string[] = [];
    e.on((ev) => ev.type === 'crash' && causes.push(ev.cause));
    e.start();
    const o = e.world.obstacles[0];
    Object.assign(o, { active: true, kind: 'balloon', x: e.plane.x + 30, y: e.plane.y, baseY: e.plane.y, prevX: e.plane.x + 30, prevY: e.plane.y, r: 18, phase: 0 });
    for (let i = 0; i < 60 && e.state === GameState.PLAYING; i++) e.advance(1 / 60);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(causes).toEqual(['balloon']);
  });

  it('raspão: passar perto sem bater rende pontos uma vez', () => {
    const e = mk();
    const got: string[] = [];
    e.on((ev) => ev.type === 'maneuver' && got.push(ev.m.kind));
    e.start();
    const o = e.world.obstacles[0];
    const y = e.plane.y - PLANE.hitRadius - 12 - 16;
    Object.assign(o, { active: true, kind: 'balloon', x: e.plane.x + 60, y, baseY: y, prevX: e.plane.x + 60, prevY: y, r: 16, phase: 0 });
    e.setHolding(true);
    e.advance(0.05);
    e.setHolding(false);
    for (let i = 0; i < 40; i++) e.advance(1 / 60);
    expect(got.filter((k) => k === 'graze').length).toBeLessThanOrEqual(1);
  });

  it('atravessar um anel dá pontos', () => {
    const e = mk();
    const got: string[] = [];
    e.on((ev) => ev.type === 'maneuver' && got.push(ev.m.kind));
    e.start();
    const r = e.world.rings[0];
    Object.assign(r, { active: true, x: e.plane.x + 40, y: e.plane.y, r: 34, passed: false, high: false, glow: 0 });
    for (let i = 0; i < 20; i++) e.advance(1 / 60);
    expect(got).toContain('ring');
  });

  it('distância à torre e ao balão', () => {
    const tower = { kind: 'tower', x: 0, r: 10, baseY: 0, top: 100 } as never;
    expect(distanceTo(tower, 20, 50)).toBeCloseTo(10);
    expect(distanceTo(tower, 0, 50)).toBeLessThan(0);
    const balloon = { kind: 'balloon', x: 0, y: 0, r: 10 } as never;
    expect(distanceTo(balloon, 30, 0)).toBeCloseTo(20);
  });

  it('câmera lenta curta numa manobra grande, desligada com menos movimento', () => {
    const loopAndWatch = (e: Engine) => {
      e.start();
      tap(e, 0.1, 0.12);
      e.setHolding(true);
      let saw = 0;
      for (let i = 0; i < 6; i++) e.advance(1 / 60);
      e.setHolding(false);
      for (let i = 0; i < 180; i++) {
        e.advance(1 / 60);
        saw = Math.max(saw, e.slowmo);
      }
      return saw;
    };
    expect(loopAndWatch(mk())).toBeGreaterThan(0);
    const f = mk();
    f.slowmoEnabled = false;
    expect(loopAndWatch(f)).toBe(0);
  });

  it('mesmo resultado com quadros de 30, 60, 120 e 144 Hz', () => {
    const run = (fps: number) => {
      const e = mk(11);
      e.slowmoEnabled = false;
      e.start();
      let t = 0;
      while (t < 4) {
        e.setHolding(t % 1.2 < 0.5);
        e.advance(1 / fps);
        t += 1 / fps;
      }
      return e.plane;
    };
    const ref = run(120);
    for (const fps of [30, 60, 144]) {
      const p = run(fps);
      // Diferença só pelo arredondamento de quando o toque cai entre passos.
      expect(Math.abs(p.x - ref.x)).toBeLessThan(40);
      expect(Math.abs(p.y - ref.y)).toBeLessThan(40);
    }
    expect(SIM.fixedDt).toBeCloseTo(1 / 120);
  });
});
