import { describe, expect, it } from 'vitest';
import { FLIGHT, SIM } from '../game/config';
import { airFactor, createPlane, liftAccel, liftFactor, maxLevelSpeed, stepPlane, type FlightCommand, type PlaneState } from '../game/Plane';

const HOLD: FlightCommand = { throttle: 1, pull: 1 };
const FREE: FlightCommand = { throttle: 0, pull: 0 };

function fly(plane: PlaneState, cmd: (t: number) => FlightCommand, seconds: number, dt = SIM.fixedDt) {
  for (let t = 0; t < seconds; t += dt) stepPlane(plane, cmd(t), dt);
  return plane;
}

describe('física do avião', () => {
  it('acelerar (sem puxar) aumenta a velocidade até perto da máxima nivelada', () => {
    const p = createPlane(0, 500, 150);
    fly(p, () => ({ throttle: 1, pull: 0 }), 0.5);
    expect(p.speed).toBeGreaterThan(150);
    expect(p.throttle).toBeCloseTo(1, 5);
  });

  it('soltar corta a potência e o nariz cai: o avião desce ganhando velocidade', () => {
    const p = createPlane(0, 500, 200);
    fly(p, () => FREE, 1.5);
    expect(p.throttle).toBeCloseTo(FLIGHT.idle, 5);
    expect(p.phi).toBeLessThan(-0.15);
    expect(p.y).toBeLessThan(500);
    expect(p.speed).toBeGreaterThan(200);
  });

  it('a sustentação cresce com a velocidade (∝ v²) e some no estol', () => {
    const slow = liftAccel(150, 1).trim + liftAccel(150, 1).pull;
    const fast = liftAccel(300, 1).trim + liftAccel(300, 1).pull;
    expect(fast).toBeGreaterThan(slow * 3);
    expect(liftFactor(FLIGHT.stallSpeed * 0.9)).toBe(0);
    expect(liftAccel(FLIGHT.stallSpeed * 0.9, 1).trim + liftAccel(FLIGHT.stallSpeed * 0.9, 1).pull).toBe(0);
    // nunca passa do limite de carga
    const huge = liftAccel(2000, 1);
    expect(huge.trim + huge.pull).toBeLessThanOrEqual(FLIGHT.maxG * FLIGHT.gravity + 1e-6);
  });

  it('segurar faz subir em curva, e mantido com velocidade fecha um loop', () => {
    const p = createPlane(0, 500, 240);
    fly(p, () => HOLD, 0.4);
    expect(p.y).toBeGreaterThan(500);
    expect(p.phi).toBeGreaterThan(0.5);
    let loopAt = -1;
    for (let t = 0.4; t < 4; t += SIM.fixedDt) {
      stepPlane(p, HOLD, SIM.fixedDt);
      if (loopAt < 0 && p.phi >= Math.PI * 2) loopAt = t;
    }
    expect(loopAt).toBeGreaterThan(1);
    expect(loopAt).toBeLessThan(2.5);
  });

  it('estol: nariz alto e devagar perde a sustentação, cai e se recupera sozinho', () => {
    const p = createPlane(0, 800, 120);
    p.phi = 1.2; // nariz bem alto
    let maxStall = 0;
    fly(p, (t) => {
      maxStall = Math.max(maxStall, p.stall);
      return t < 0.1 ? { throttle: 0, pull: 0 } : FREE;
    }, 4);
    expect(maxStall).toBeGreaterThan(0.9);
    expect(p.stall).toBe(0); // recuperou
    const s = Math.sin(p.phi);
    expect(s).toBeGreaterThan(-0.7); // não ficou preso num mergulho vertical
    expect(p.y).toBeGreaterThan(300); // recuperou com altura (não é morte instantânea)
  });

  it('mergulho vertical sem tocar sempre se recupera para a frente', () => {
    const p = createPlane(0, 900, 300);
    p.phi = -Math.PI / 2 + 0.01;
    fly(p, () => FREE, 3);
    expect(Math.cos(p.phi)).toBeGreaterThan(0.8);
  });

  it('teto suave: ar rarefeito tira força, mas não há parede', () => {
    expect(airFactor(0)).toBe(1);
    expect(airFactor(FLIGHT.thinAirEnd + 500)).toBeCloseTo(FLIGHT.thinAirMin, 5);
    const p = createPlane(0, FLIGHT.thinAirEnd, 400);
    p.phi = Math.PI / 2;
    fly(p, () => ({ throttle: 1, pull: 0 }), 4);
    expect(p.y).toBeLessThan(FLIGHT.thinAirEnd + 400);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it('velocidade máxima nivelada é finita e coerente com o arrasto', () => {
    expect(maxLevelSpeed()).toBeGreaterThan(350);
    expect(maxLevelSpeed()).toBeLessThan(550);
  });

  it('independente da taxa de quadros (30, 60, 120 e 144 Hz) com passo fixo', () => {
    // O motor usa passo fixo de 1/120 s com acumulador; aqui reproduzimos isso
    // com quadros de tamanhos diferentes e comparamos o resultado.
    const sim = (fps: number) => {
      const p = createPlane(0, 500, 240);
      let acc = 0;
      let t = 0;
      for (let f = 0; f < fps * 3; f++) {
        acc += 1 / fps;
        while (acc >= SIM.fixedDt) {
          stepPlane(p, t % 1 < 0.6 ? HOLD : FREE, SIM.fixedDt);
          t += SIM.fixedDt;
          acc -= SIM.fixedDt;
        }
      }
      return p;
    };
    const ref = sim(120);
    for (const fps of [30, 60, 144]) {
      const p = sim(fps);
      expect(Math.abs(p.x - ref.x)).toBeLessThan(ref.speed * 2 * SIM.fixedDt + 1);
      expect(Math.abs(p.y - ref.y)).toBeLessThan(ref.speed * 2 * SIM.fixedDt + 1);
    }
  });
});
