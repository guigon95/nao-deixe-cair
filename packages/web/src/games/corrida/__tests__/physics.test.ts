import { describe, expect, it } from 'vitest';
import { BODY, JUMP, SIM } from '../game/config';
import { Level } from '../game/Level';
import { createRunner, stepRunner, type Controls, type StepSink } from '../game/Physics';
import type { Crate, Fruit, Runner } from '../game/types';

const DT = SIM.fixedDt;
const V = 300;

function flat(): Level {
  const l = new Level();
  l.addGround(-500, 100_000);
  return l;
}

function run(r: Runner, level: Level, steps: number, ctl: (i: number) => Partial<Controls> = () => ({}), sink?: StepSink, dt = DT) {
  let death = null;
  for (let i = 0; i < steps && !death; i++) {
    death = stepRunner(r, { hold: false, pressed: false, drop: false, ...ctl(i) }, level, V, dt, sink);
  }
  return death;
}

function recorder() {
  const log = { jumps: 0, lands: 0, crates: [] as Array<[Crate, boolean]>, fruits: [] as Fruit[], springs: 0 };
  const sink: StepSink = {
    jump: () => log.jumps++,
    land: () => log.lands++,
    crate: (c, stomp) => {
      if (!c.broken) {
        c.broken = true;
        log.crates.push([c, stomp]);
      }
    },
    smash: (o) => {
      o.broken = true;
    },
    spring: () => log.springs++,
    fruit: (f) => {
      if (!f.taken) {
        f.taken = true;
        log.fruits.push(f);
      }
    },
  };
  return { log, sink };
}

describe('física do pulo', () => {
  it('apertar pula na hora; a gravidade traz de volta ao chão', () => {
    const r = createRunner(0);
    const level = flat();
    stepRunner(r, { hold: true, pressed: true, drop: false }, level, V, DT);
    expect(r.grounded).toBe(false);
    expect(r.vy).toBeGreaterThan(0);
    run(r, level, 240);
    expect(r.grounded).toBe(true);
    expect(r.y).toBe(0);
  });

  it('segurar pula mais alto que um toque curto (pulo variável), com teto', () => {
    const peak = (holdSteps: number) => {
      const r = createRunner(0);
      const level = flat();
      let max = 0;
      for (let i = 0; i < 200; i++) {
        stepRunner(r, { hold: i < holdSteps, pressed: i === 0, drop: false }, level, V, DT);
        max = Math.max(max, r.y);
      }
      return max;
    };
    const tap = peak(1);
    const full = peak(200);
    expect(full).toBeGreaterThan(tap + 50);
    expect(full).toBeLessThanOrEqual((JUMP.jumpVelocity * JUMP.jumpVelocity) / (2 * JUMP.gravityUp) + 2);
    expect(tap).toBeGreaterThan(40);
  });

  it('não há pulo no ar: apertar de novo no meio do pulo não sobe', () => {
    const r = createRunner(0);
    const level = flat();
    const { log, sink } = recorder();
    run(r, level, 30, (i) => ({ pressed: i === 0 || i === 20, hold: true }), sink);
    expect(log.jumps).toBe(1);
  });

  it('segurar caindo plana (queda lenta), com limite de tempo', () => {
    const fall = (hold: boolean) => {
      const r = createRunner(0);
      const level = new Level(); // sem chão: queda livre
      r.grounded = false;
      r.jumped = true;
      r.y = 400;
      run(r, level, 60, () => ({ hold }));
      return r;
    };
    const glide = fall(true);
    const free = fall(false);
    expect(glide.y).toBeGreaterThan(free.y + 60);
    expect(glide.vy).toBeGreaterThanOrEqual(-JUMP.glideMaxFall - 1);
    // Depois do limite, cai normalmente mesmo segurando.
    const long = createRunner(0);
    long.grounded = false;
    long.jumped = true;
    long.y = 2000;
    run(long, new Level(), Math.round((JUMP.glideMax + 0.4) / DT), () => ({ hold: true }));
    expect(long.gliding).toBe(false);
    expect(long.vy).toBeLessThan(-JUMP.glideMaxFall - 100);
  });

  it('toque pouco antes de pousar vale como pulo ao pousar (buffer)', () => {
    const r = createRunner(0);
    r.grounded = false;
    r.jumped = true;
    r.y = 8;
    r.vy = -300;
    const { log, sink } = recorder();
    run(r, flat(), 20, (i) => ({ pressed: i === 0 }), sink);
    expect(log.jumps).toBe(1);
  });

  it('tolerância na beirada (coyote): pular logo depois de sair do chão funciona', () => {
    const level = new Level();
    level.addGround(-500, 20);
    const r = createRunner(0);
    // corre até sair da beirada
    let i = 0;
    while (r.grounded && i++ < 200) stepRunner(r, { hold: false, pressed: false, drop: false }, level, V, DT);
    expect(r.grounded).toBe(false);
    const { log, sink } = recorder();
    stepRunner(r, { hold: true, pressed: true, drop: false }, level, V, DT, sink);
    expect(log.jumps).toBe(1);
    expect(r.vy).toBeGreaterThan(0);
  });

  it('a física não depende do FPS: passos menores dão o mesmo pulo', () => {
    const traj = (dt: number) => {
      const r = createRunner(0);
      const level = flat();
      const n = Math.round(0.3 / dt);
      for (let i = 0; i < n; i++) stepRunner(r, { hold: true, pressed: i === 0, drop: false }, level, V, dt);
      return r;
    };
    const a = traj(1 / 120);
    const b = traj(1 / 240);
    expect(Math.abs(a.x - b.x)).toBeLessThan(2);
    expect(Math.abs(a.y - b.y)).toBeLessThan(6);
  });

  it('descer rápido (deslizar ↓) no ar acelera a queda; no galho, atravessa', () => {
    const r = createRunner(0);
    r.grounded = false;
    r.jumped = true;
    r.y = 150;
    r.vy = 200;
    stepRunner(r, { hold: false, pressed: false, drop: true }, new Level(), V, DT);
    expect(r.vy).toBeLessThan(-JUMP.fastFallVelocity + 50);

    const level = flat();
    level.platforms.push({ x0: -100, x1: 400, y: 80 });
    const s = createRunner(0);
    s.y = 80;
    s.grounded = true;
    run(s, level, 2);
    expect(s.grounded).toBe(true);
    stepRunner(s, { hold: false, pressed: false, drop: true }, level, V, DT);
    run(s, level, 60);
    expect(s.y).toBe(0);
  });
});

describe('colisões', () => {
  it('bater de lado numa pedra encerra; pousar em cima apoia', () => {
    const level = flat();
    level.rocks.push({ x0: 60, x1: 94, top: 30, variant: 0, broken: false });
    const r = createRunner(0);
    expect(run(r, level, 120)).toBe('rock');

    const r2 = createRunner(0);
    r2.x = 75;
    r2.y = 60;
    r2.grounded = false;
    r2.jumped = true;
    const lvl2 = flat();
    lvl2.rocks.push({ x0: 60, x1: 200, top: 30, variant: 0, broken: false });
    run(r2, lvl2, 40);
    expect(r2.grounded).toBe(true);
    expect(r2.y).toBe(30);
  });

  it('espinhos encerram a partida; buraco leva ao rio', () => {
    const level = flat();
    level.thorns.push({ x0: 60, x1: 160, top: 24, broken: false });
    expect(run(createRunner(0), level, 120)).toBe('thorns');
    const pit = new Level();
    pit.addGround(-500, 50);
    pit.addGround(400, 2000);
    expect(run(createRunner(0), pit, 200)).toBe('river');
  });

  it('caixote de lado é quebrado uma vez (sem morrer); por cima, quica', () => {
    const level = flat();
    level.crates.push({ x0: 60, x1: 96, top: 36, broken: false, brokenAt: 0 });
    const { log, sink } = recorder();
    const r = createRunner(0);
    expect(run(r, level, 120, () => ({}), sink)).toBeNull();
    expect(log.crates).toHaveLength(1);
    expect(log.crates[0][1]).toBe(false);

    const lvl = flat();
    lvl.crates.push({ x0: 0, x1: 36, top: 36, broken: false, brokenAt: 0 });
    const s = createRunner(10);
    s.grounded = false;
    s.jumped = true;
    s.y = 70;
    s.vy = -200;
    const rec = recorder();
    let bounced = false;
    for (let i = 0; i < 40 && !bounced; i++) {
      stepRunner(s, { hold: false, pressed: false, drop: false }, lvl, V, DT, rec.sink);
      bounced = rec.log.crates.length > 0;
    }
    expect(rec.log.crates[0][1]).toBe(true);
    expect(s.vy).toBeGreaterThan(0);
  });

  it('cada fruta é coletada uma única vez', () => {
    const level = flat();
    level.fruits.push({ x: 80, y: 17, taken: false, risky: false }, { x: 120, y: 200, taken: false, risky: false });
    const { log, sink } = recorder();
    run(createRunner(0), level, 120, () => ({}), sink);
    expect(log.fruits).toHaveLength(1);
    expect(log.fruits[0].x).toBe(80);
  });

  it('a flor-mola lança alto ao encostar', () => {
    const level = flat();
    level.springs.push({ x0: 40, x1: 74, top: 12, usedAt: -9 });
    const { log, sink } = recorder();
    const r = createRunner(0);
    let max = 0;
    for (let i = 0; i < 120; i++) {
      stepRunner(r, { hold: false, pressed: false, drop: false }, level, V, DT, sink);
      max = Math.max(max, r.y);
    }
    expect(log.springs).toBeGreaterThanOrEqual(1);
    expect(max).toBeGreaterThan(250);
  });

  it('em alta velocidade não atravessa pedras (passo pequeno)', () => {
    const level = flat();
    level.rocks.push({ x0: 300, x1: 334, top: 30, variant: 0, broken: false });
    const r = createRunner(0);
    let death = null;
    for (let i = 0; i < 240 && !death; i++) death = stepRunner(r, { hold: false, pressed: false, drop: false }, level, 900, DT);
    expect(death).toBe('rock');
  });

  it('a caixa de colisão é menor que o desenho (perdoa raspões)', () => {
    expect(BODY.halfWidth * 2).toBeLessThan(34);
    expect(BODY.height).toBeLessThan(40);
  });
});
