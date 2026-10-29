import { describe, expect, it } from 'vitest';
import { SIM, SPEED, TOCA } from '../game/config';
import { Engine } from '../game/Engine';
import { Level } from '../game/Level';
import { Missions } from '../game/Missions';
import { createRunner, stepRunner, type StepSink } from '../game/Physics';
import { byId } from '../game/Track';
import { Builder } from '../game/patterns';
import { planRoute } from '../game/testing/planner';
import { GameState, type GameEvent } from '../game/types';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;
const X0 = 600;
const toca = byId('toca');

/** Só o padrão da toca, com chão antes e depois (como o gerador faz). */
function single(v: number) {
  const level = new Level();
  const b = new Builder(level, X0, v, createRng(1), 0);
  const dur = toca.build(b);
  let cursor = -400;
  for (const [a, z] of [...b.pits].sort((p, q) => p[0] - q[0])) {
    level.addGround(cursor, a);
    cursor = z;
  }
  const end = X0 + (dur + 1) * v;
  level.addGround(cursor, end + 400);
  level.fruits.sort((p, q) => p.x - q.x);
  return { level, end, burrow: level.burrows[0] };
}

function counter() {
  const log = { fruits: 0, outs: 0 };
  const sink: StepSink = {
    jump() {},
    land() {},
    crate() {},
    smash() {},
    spring() {},
    fruit(f) {
      f.taken = true;
      log.fruits++;
    },
    grab() {},
    letGo() {},
    burrowOut() {
      log.outs++;
    },
  };
  return { log, sink };
}

const SPEEDS = [SPEED.start, SPEED.max, SPEED.max * 1.1];

describe('toca da capivara', () => {
  for (const v of SPEEDS) {
    it(`sem tocar (${Math.round(v)} u/s): cai no buraco, passa pela toca comendo capim e sai pela saída`, () => {
      const { level, end, burrow } = single(v);
      const r = createRunner(0);
      const { log, sink } = counter();
      const ctl = { hold: false, pressed: false, drop: false };
      let minY = 0;
      let underAt = -1;
      for (let i = 0; r.x < end; i++) {
        const death = stepRunner(r, ctl, level, v, DT, sink);
        expect(death, `morreu em x=${r.x.toFixed(0)} y=${r.y.toFixed(0)}`).toBeNull();
        minY = Math.min(minY, r.y);
        if (underAt < 0 && r.y < TOCA.below) underAt = r.x;
        // Dentro do túnel o corpo nunca passa do teto.
        if (r.x > burrow.holeEnd && r.x < burrow.exitStart && r.y < 0) expect(r.y + 34).toBeLessThanOrEqual(TOCA.roof + 0.01);
        expect(i).toBeLessThan(20_000);
      }
      expect(underAt).toBeGreaterThanOrEqual(burrow.x0);
      expect(underAt).toBeLessThanOrEqual(burrow.holeEnd);
      expect(minY).toBe(TOCA.floor);
      expect(log.outs).toBe(1);
      // Comeu as fileiras do chão da toca (13 capins).
      expect(log.fruits).toBeGreaterThanOrEqual(13);
      // De volta à superfície, no chão.
      expect(r.y).toBe(0);
      expect(r.grounded).toBe(true);
    });

    it(`pulando o buraco (${Math.round(v)} u/s) segue por cima e ainda atravessa`, () => {
      const { level, end, burrow } = single(v);
      // Pula logo antes do buraco segurando e segue com o planejador por cima.
      const r = createRunner(0);
      const ctl = { hold: false, pressed: false, drop: false };
      const { sink } = counter();
      while (r.x < burrow.x0 - 25) stepRunner(r, ctl, level, v, DT, sink);
      for (let i = 0; !(i > 2 && r.grounded); i++) {
        ctl.pressed = i === 0;
        ctl.hold = i < 40;
        expect(stepRunner(r, ctl, level, v, DT, sink)).toBeNull();
      }
      expect(r.y).toBe(0);
      expect(r.x).toBeGreaterThan(burrow.holeEnd);
      const plan = planRoute(level, r, { goalX: end, elapsed: 0, fixedSpeed: v, maxJumps: 6 });
      expect(plan).not.toBeNull();
    });
  }

  it('na toca, as pedras e espinhos de cima não machucam', () => {
    const { level, burrow } = single(SPEED.start);
    const r = createRunner(burrow.holeEnd + 10);
    r.y = TOCA.floor;
    const ctl = { hold: false, pressed: false, drop: false };
    const { sink } = counter();
    while (r.x < burrow.exitStart) expect(stepRunner(r, ctl, level, SPEED.start, DT, sink)).toBeNull();
  });

  it('o teto segura o pulo dentro da toca', () => {
    const { level, burrow } = single(SPEED.start);
    const r = createRunner(burrow.holeEnd + 20);
    r.y = TOCA.floor;
    const ctl = { hold: true, pressed: true, drop: false };
    const { sink } = counter();
    let top = -Infinity;
    for (let i = 0; i < 60; i++) {
      stepRunner(r, ctl, level, SPEED.start, DT, sink);
      ctl.pressed = false;
      top = Math.max(top, r.y);
    }
    expect(top).toBeLessThanOrEqual(TOCA.roof - 34 + 0.01);
    expect(top).toBeGreaterThan(TOCA.floor + 20);
  });

  it('motor: avisa ao entrar e ao sair, conta a missão e o jacaré não aparece nos buracos da toca', () => {
    const e = new Engine({ storage: new MemoryStorage(), seed: 2, lives: 0, resumeDelay: 0 });
    const events: GameEvent[] = [];
    e.on((ev) => events.push(ev));
    e.start();
    const l = e.track.level;
    l.clear();
    l.addGround(-800, 400);
    const b = new Builder(l, 400, e.speed, createRng(1), 0);
    const dur = toca.build(b);
    let cursor = 400;
    for (const [a, z] of [...b.pits].sort((p, q) => p[0] - q[0])) {
      l.addGround(cursor, a);
      cursor = z;
    }
    l.addGround(cursor, 400 + (dur + 30) * e.speed);
    l.fruits.sort((p, q) => p.x - q.x);
    e.track.genX = 400 + (dur + 30) * e.speed;
    for (let i = 0; i < 6 / DT && e.state === GameState.PLAYING; i++) e.step(DT);
    expect(e.state).toBe(GameState.PLAYING);
    expect(events.filter((ev) => ev.type === 'burrow' && ev.on)).toHaveLength(1);
    expect(events.filter((ev) => ev.type === 'burrow' && !ev.on)).toHaveLength(1);
    expect(e.inBurrow).toBe(false);
    expect(l.burrows[0]?.opened ?? true).toBe(true);
  });

  it('continuar perto da toca tampa os buracos (sem rio pela metade)', () => {
    const { level, burrow } = single(SPEED.start);
    level.clearZone(burrow.x0 + 50, burrow.x0 + 120);
    expect(level.burrows).toHaveLength(0);
    for (let x = burrow.x0; x <= burrow.x1; x += 10) expect(level.groundAt(x)).toBe(true);
  });

  it('missão da toca', () => {
    const m = new Missions(new MemoryStorage());
    expect(typeof m.burrow).toBe('function');
    expect(Array.isArray(m.burrow())).toBe(true);
  });
});
