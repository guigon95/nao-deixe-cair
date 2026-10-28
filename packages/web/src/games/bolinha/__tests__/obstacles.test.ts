import { describe, expect, it } from 'vitest';
import { BALL_X, OBSTACLES, PHYSICS, playfield } from '../game/config';
import { difficultyAt, DIFFICULTY_CURVE } from '../game/Difficulty';
import { GameEngine } from '../game/GameEngine';
import { ObstacleManager, maxFeasibleShift } from '../game/ObstacleManager';
import { reachableDistance } from '../game/Physics';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../game/ScoreManager';
import { autoplay, Autopilot } from '../game/testing/autopilot';
import type { Barrier } from '../game/types';

/** Roda o gerador por `seconds` e coleta cada barreira no momento em que nasce. */
function collect(seed: number, seconds: number) {
  const m = new ObstacleManager(createRng(seed));
  const spawned: Array<{ b: Barrier; t: number; nearestOther: number }> = [];
  const seen = new Set<number>();
  let maxAlive = 0;
  const dt = PHYSICS.fixedDt;
  for (let t = 0; t < seconds; t += dt) {
    m.update(dt, t);
    maxAlive = Math.max(maxAlive, m.barriers.length);
    for (const b of m.barriers) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const prev = m.barriers.filter((o) => o.id < b.id).pop();
      spawned.push({ b: { ...b }, t, nearestOther: prev ? b.x - prev.x : Infinity });
    }
  }
  return { m, spawned, maxAlive };
}

describe('Movimento e ciclo de vida das barreiras', () => {
  it('aplica a velocidade horizontal corretamente (direita → esquerda)', () => {
    const m = new ObstacleManager(createRng(1));
    m.fill(difficultyAt(0));
    const b = m.barriers[0];
    const x0 = b.x;
    m.update(0.1, 0);
    expect(b.x).toBeCloseTo(x0 - difficultyAt(0).speed * 0.1, 6);
  });

  it('nascem à direita da arena, fora da tela e longe da bolinha', () => {
    const { spawned } = collect(7, 60);
    for (const { b } of spawned) {
      expect(b.x - BALL_X).toBeGreaterThanOrEqual(OBSTACLES.minSpawnDistanceFromBall);
      expect(b.x).toBeGreaterThan(300);
    }
  });

  it('são removidas ao sair pela esquerda e a memória não cresce', () => {
    const { m, maxAlive } = collect(9, 240);
    expect(maxAlive).toBeLessThanOrEqual(6);
    for (const b of m.barriers) expect(b.x + b.width).toBeGreaterThan(-20);
  });

  it('é determinístico para a mesma semente', () => {
    const a = collect(123, 30).spawned.map((s) => s.b.gapTop);
    const b = collect(123, 30).spawned.map((s) => s.b.gapTop);
    expect(a).toEqual(b);
  });
});

describe('Limites do gerador', () => {
  const seeds = [1, 2, 3, 17, 99, 2024, 31337, 4242];
  const { top, bottom } = playfield();

  it('nunca gera valores inválidos, vãos pequenos demais ou fora da área jogável', () => {
    for (const seed of seeds) {
      for (const { b } of collect(seed, 300).spawned) {
        for (const v of [b.x, b.gapTop, b.gapBottom, b.width]) expect(Number.isFinite(v)).toBe(true);
        const gap = b.gapBottom - b.gapTop;
        expect(gap).toBeGreaterThanOrEqual(OBSTACLES.absoluteMinGap - 1e-9);
        expect(gap).toBeGreaterThan(PHYSICS.ballRadius * 2 * 4); // folga ampla para a bolinha
        expect(b.gapTop).toBeGreaterThanOrEqual(top);
        expect(b.gapBottom).toBeLessThanOrEqual(bottom);
      }
    }
  });

  it('barreiras não se sobrepõem e mantêm espaço para a bolinha passar entre elas', () => {
    for (const seed of seeds) {
      for (const { nearestOther } of collect(seed, 300).spawned) {
        expect(nearestOther).toBeGreaterThanOrEqual(OBSTACLES.width + 4 * PHYSICS.ballRadius);
      }
    }
  });

  it('as primeiras barreiras são de aquecimento (vão central e largo)', () => {
    const { spawned } = collect(5, 10);
    const first = spawned.slice(0, DIFFICULTY_CURVE.warmupBarriers);
    const mid = (top + bottom) / 2;
    for (const { b } of first) {
      expect((b.gapTop + b.gapBottom) / 2).toBeCloseTo(mid, 3);
      expect(Math.abs(b.gapBottom - b.gapTop - DIFFICULTY_CURVE.gap.start)).toBeLessThan(4);
    }
  });

  it('toda transição exige no máximo o que a física permite (com tempo de reação)', () => {
    for (const seed of seeds) {
      const { spawned } = collect(seed, 300);
      for (let i = 1; i < spawned.length; i++) {
        const prev = spawned[i - 1].b;
        const cur = spawned[i].b;
        const spacing = spawned[i].nearestOther;
        const speed = difficultyAt(spawned[i].t).speed;
        const dy = (cur.gapTop + cur.gapBottom) / 2 - (prev.gapTop + prev.gapBottom) / 2;
        const r = PHYSICS.ballRadius;
        const slack = (prev.gapBottom - prev.gapTop) / 2 - r + ((cur.gapBottom - cur.gapTop) / 2 - r);
        // Verificação independente e menos conservadora que o gerador:
        // tempo total entre as barreiras, sem margem de segurança, contra o deslocamento necessário.
        const time = (spacing - OBSTACLES.width - 2 * r) / (speed * 1.08) - OBSTACLES.reactionTime;
        const reach = reachableDistance(time, dy < 0 ? 'up' : 'down');
        expect(Math.max(0, Math.abs(dy) - slack)).toBeLessThanOrEqual(reach + 1e-6);
        // E a regra do próprio gerador (com segurança e metade da folga) também vale.
        const need = Math.max(0, Math.abs(dy) - slack * 0.5);
        expect(need).toBeLessThanOrEqual(maxFeasibleShift(spacing, speed, dy < 0 ? 'up' : 'down') + 1e-6);
      }
    }
  });

  it('a dificuldade evolui sem saltos: vãos e alturas mudam gradualmente', () => {
    for (const seed of seeds) {
      const { spawned } = collect(seed, 300);
      for (let i = 1; i < spawned.length; i++) {
        const g0 = spawned[i - 1].b.gapBottom - spawned[i - 1].b.gapTop;
        const g1 = spawned[i].b.gapBottom - spawned[i].b.gapTop;
        expect(Math.abs(g1 - g0)).toBeLessThan(45); // variação de vão limitada entre vizinhas
      }
    }
  });
});

describe('Curva de dificuldade', () => {
  it('é monotônica e limitada', () => {
    let prev = difficultyAt(0);
    for (let t = 1; t <= 600; t += 1) {
      const d = difficultyAt(t);
      expect(d.speed).toBeGreaterThanOrEqual(prev.speed);
      expect(d.gap).toBeLessThanOrEqual(prev.gap);
      expect(d.spacing).toBeLessThanOrEqual(prev.spacing);
      expect(d.speed).toBeLessThanOrEqual(DIFFICULTY_CURVE.speed.end);
      expect(d.gap).toBeGreaterThanOrEqual(DIFFICULTY_CURVE.gap.end);
      prev = d;
    }
  });

  it('a frequência de barreiras aumenta (menos tempo entre elas)', () => {
    const f = (t: number) => difficultyAt(t).speed / difficultyAt(t).spacing;
    expect(f(120)).toBeGreaterThan(f(0) * 1.4);
  });
});

describe('Justiça: um piloto automático consegue sobreviver', () => {
  it('sobrevive ≥ 120 s na grande maioria das sementes (nenhuma sequência impossível)', () => {
    const seeds = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111];
    const survived = seeds.map((s) => {
      const e = new GameEngine({ storage: new MemoryStorage(), seed: s });
      return autoplay(e, 120, new Autopilot(9));
    });
    const ok = survived.filter((t) => t >= 120 - 1e-6).length;
    expect(ok).toBeGreaterThanOrEqual(9);
  }, 120_000);
});
