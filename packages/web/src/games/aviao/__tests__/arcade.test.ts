import { describe, expect, it } from 'vitest';
import { ARCADE } from '../game/config';
import { Engine } from '../game/Engine';
import { createPlane, stepArcade } from '../game/Plane';
import { autoplay } from '../game/testing/autopilot';
import { GameState } from '../game/types';
import { ARCADE_DIFFICULTY, BIRD_RANGE, World } from '../game/World';
import { difficultyAt as ballDifficulty } from '../../bolinha/game/Difficulty';
import { stepBall } from '../../bolinha/game/Physics';
import { PHYSICS } from '../../bolinha/game/config';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = PHYSICS.fixedDt;

describe('modo bolinha: física idêntica à do jogo da bolinha', () => {
  it('o movimento vertical é o mesmo da bolinha, passo a passo (só com o eixo invertido)', () => {
    const rng = createRng(42);
    for (let trial = 0; trial < 20; trial++) {
      const ball = { x: 0, y: 320, prevY: 320, vy: 0, radius: PHYSICS.ballRadius };
      const plane = createPlane(0, 300, 150);
      let holding = rng() < 0.5;
      // 0,8 s de toques aleatórios: a bolinha não chega nas bordas da arena.
      for (let i = 0; i < 96; i++) {
        if (rng() < 0.08) holding = !holding;
        stepBall(ball, holding, DT);
        stepArcade(plane, holding, 150, DT);
        expect(plane.vy).toBeCloseTo(-ball.vy, 9);
        expect(300 - plane.y).toBeCloseTo(ball.y - 320, 6);
      }
    }
  });

  it('anda para a frente na mesma velocidade das barreiras da bolinha', () => {
    const e = new Engine({ storage: new MemoryStorage(), seed: 3 });
    e.start();
    for (let i = 0; i < 600 && e.state === GameState.PLAYING; i++) {
      e.setHolding(i % 40 < 18);
      const x0 = e.plane.x;
      const speed = ballDifficulty(e.elapsed).speed;
      e.step(DT);
      if (e.state === GameState.PLAYING) expect(e.plane.x - x0).toBeCloseTo(speed * DT, 6);
    }
  });

  it('o nariz acompanha a direção do movimento (sobe ao segurar, desce ao soltar)', () => {
    const p = createPlane(0, 300, 150);
    for (let i = 0; i < 30; i++) stepArcade(p, true, 150, DT);
    expect(p.phi).toBeGreaterThan(0.3);
    for (let i = 0; i < 60; i++) stepArcade(p, false, 150, DT);
    expect(p.phi).toBeLessThan(-0.3);
  });

  it('teto: segurar para sempre encosta em cima e para, sem bater (como a borda da bolinha)', () => {
    const p = createPlane(0, 300, 150);
    for (let i = 0; i < 600; i++) stepArcade(p, true, 150, DT);
    expect(p.y).toBe(ARCADE.ceiling);
    expect(p.vy).toBe(0);
  });

  it('sem tocar, cai e bate no chão', () => {
    const e = new Engine({ storage: new MemoryStorage(), seed: 5 });
    const causes: string[] = [];
    e.on((ev) => ev.type === 'crash' && causes.push(ev.cause));
    e.start();
    for (let i = 0; i < 240 && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(causes).toEqual(['ground']);
  });

  it('nenhum obstáculo invade o corredor nem passa do teto, em 20 sementes', () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const w = new World(createRng(seed), seed, ARCADE.corridorCeiling, ARCADE_DIFFICULTY);
      for (let x = 0; x < 30000; x += 200) {
        w.update(x, 0);
        for (const s of w.segments) if (s.center + s.gap / 2 > ARCADE.corridorCeiling + 0.5) bad.push(`teto ${seed} ${s.x0}`);
        for (const o of w.obstacles) {
          if (!o.active) continue;
          const x0 = o.kind === 'bird' ? o.top - BIRD_RANGE : o.x - o.r;
          const x1 = o.kind === 'bird' ? o.top : o.x + o.r;
          for (let k = 0; k <= 8; k++) {
            const c = w.corridorAt(x0 + ((x1 - x0) * k) / 8);
            if (!c) continue;
            const ok = o.kind === 'tower' ? o.top <= c.bottom : o.baseY + o.r + 6 <= c.bottom || o.baseY - o.r - 6 >= c.top;
            if (!ok) bad.push(`semente ${seed}: ${o.kind}`);
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 30000);

  it('piloto automático sobrevive 120 s em 20 sementes (o mundo é sempre voável)', () => {
    for (let seed = 200; seed < 220; seed++) {
      const e = new Engine({ storage: new MemoryStorage(), seed });
      const r = autoplay(e, 120);
      expect(r.crashed, `semente ${seed} bateu em ${r.survived.toFixed(1)} s`).toBe(false);
    }
  }, 30000);
});
