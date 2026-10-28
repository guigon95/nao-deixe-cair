import { describe, expect, it } from 'vitest';
import { ballBounds, PHYSICS } from '../game/config';
import { GameEngine } from '../game/GameEngine';
import { DEFAULT_PHYSICS, reachableDistance, stepBall, verticalAcceleration } from '../game/Physics';
import { MemoryStorage } from '../game/ScoreManager';
import type { Ball } from '../game/types';

const dt = PHYSICS.fixedDt;
const mid = () => (ballBounds().minY + ballBounds().maxY) / 2;
const newBall = (y = mid(), vy = 0): Ball => ({ x: 100, y, prevY: y, vy, radius: PHYSICS.ballRadius });

describe('Física da bolinha', () => {
  it('segurar acelera para cima (vy negativo) e a bolinha sobe', () => {
    const b = newBall();
    const y0 = b.y;
    for (let i = 0; i < 12; i++) stepBall(b, true, dt);
    expect(b.vy).toBeLessThan(0);
    expect(b.y).toBeLessThan(y0);
  });

  it('soltar faz a bolinha cair', () => {
    const b = newBall();
    const y0 = b.y;
    for (let i = 0; i < 12; i++) stepBall(b, false, dt);
    expect(b.vy).toBeGreaterThan(0);
    expect(b.y).toBeGreaterThan(y0);
  });

  it('não é velocidade fixa: a subida acelera gradualmente', () => {
    const b = newBall();
    stepBall(b, true, dt);
    const v1 = -b.vy;
    for (let i = 0; i < 5; i++) stepBall(b, true, dt);
    expect(-b.vy).toBeGreaterThan(v1 * 3);
    expect(-b.vy).toBeLessThan(DEFAULT_PHYSICS.maxRiseSpeed);
  });

  it('inverter a direção recebe reforço (resposta rápida, sem sensação “borrachuda”)', () => {
    const falling = verticalAcceleration(300, true);
    const rising = verticalAcceleration(-300, true);
    expect(falling).toBeLessThan(rising); // mais força para cima quando está caindo
    const tReverse = 480 / Math.abs(verticalAcceleration(480, true));
    expect(tReverse).toBeLessThan(0.25);
  });

  it('a velocidade respeita os limites configurados', () => {
    const b = newBall();
    for (let i = 0; i < 600; i++) {
      stepBall(b, i % 200 < 100, dt);
      expect(b.vy).toBeGreaterThanOrEqual(-DEFAULT_PHYSICS.maxRiseSpeed - 1e-9);
      expect(b.vy).toBeLessThanOrEqual(DEFAULT_PHYSICS.maxFallSpeed + 1e-9);
    }
  });

  it('a bolinha nunca sai da arena e a velocidade para fora é anulada', () => {
    const { minY, maxY } = ballBounds();
    const b = newBall();
    for (let i = 0; i < 400; i++) stepBall(b, true, dt);
    expect(b.y).toBe(minY);
    expect(b.vy).toBe(0);
    // Segurar no teto por muito tempo continua responsivo: ao soltar, cai imediatamente.
    stepBall(b, false, dt);
    expect(b.vy).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) stepBall(b, false, dt);
    expect(b.y).toBe(maxY);
    expect(b.vy).toBe(0);
    stepBall(b, true, dt);
    expect(b.vy).toBeLessThan(0);
  });

  it('alcance físico cresce com o tempo e é zero sem tempo', () => {
    expect(reachableDistance(0, 'up')).toBe(0);
    expect(reachableDistance(-1, 'down')).toBe(0);
    const a = reachableDistance(0.2, 'up');
    const b = reachableDistance(0.5, 'up');
    expect(b).toBeGreaterThan(a);
    expect(reachableDistance(0.5, 'down')).toBeGreaterThan(0);
  });
});

describe('Independência da taxa de quadros', () => {
  function simulate(frameDt: number, totalTime: number, holdPattern: (t: number) => boolean) {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 42 });
    e.start();
    const frames = Math.round(totalTime / frameDt);
    for (let i = 0; i < frames; i++) {
      e.setHolding(holdPattern(i * frameDt + 1e-9));
      e.advance(frameDt);
    }
    return e;
  }
  // Alterna a cada 0,5 s — múltiplo exato de todos os períodos de quadro testados.
  const pattern = (t: number) => Math.floor(t / 0.5) % 2 === 0;

  it('30, 60, 120 e 144 Hz produzem o mesmo resultado (± um passo)', () => {
    const results = [1 / 30, 1 / 60, 1 / 120, 1 / 144].map((f) => simulate(f, 2.0, pattern));
    const ref = results[2];
    for (const r of results) {
      expect(Math.abs(r.elapsed - ref.elapsed)).toBeLessThanOrEqual(dt + 1e-9);
      expect(Math.abs(r.ball.y - ref.ball.y)).toBeLessThan(4);
    }
  });

  it('um quadro gigante (aba travada) é limitado e não teletransporta a bolinha', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    e.start();
    const steps = e.advance(5); // 5 s de uma vez
    expect(steps).toBeLessThanOrEqual(Math.ceil(PHYSICS.maxFrameTime / dt) + 1);
    expect(e.elapsed).toBeLessThanOrEqual(PHYSICS.maxFrameTime + 1e-9);
  });

  it('dt inválido (NaN, negativo, zero) é ignorado', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 1 });
    e.start();
    expect(e.advance(NaN)).toBe(0);
    expect(e.advance(-1)).toBe(0);
    expect(e.advance(0)).toBe(0);
    expect(e.elapsed).toBe(0);
  });
});
