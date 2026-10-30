import { describe, expect, it } from 'vitest';
import { CRATE_LOOT, JUMP, MOUNT, MOUNTS, SIM, TOCA } from '../game/config';
import { Engine } from '../game/Engine';
import { Track } from '../game/Track';
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
  l.fruits.length = l.powerups.length = 0;
  l.ground.length = 0;
  l.addGround(-800, 40_000);
  e.track.genX = 40_000;
  return { e, l, events };
}

const run = (e: Engine, s: number) => {
  for (let i = 0; i < s / DT && e.state === GameState.PLAYING; i++) e.step(DT);
};

function ridden(e: Engine) {
  e.mount = { animal: 'ema', state: 'ridden', x: e.runner.x, y: 0, vy: 0, t: 0 };
}

const mounts = (events: GameEvent[], phase: string) => events.filter((ev) => ev.type === 'mount' && ev.phase === phase);

describe('ema (montaria)', () => {
  it('caixotes de ema: raros, só depois de 25 s e espaçados', () => {
    let count = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const t = new Track(createRng(seed));
      const times: number[] = [];
      for (let x = 0; x < 150_000; x += 400) {
        const before = new Set(t.level.crates);
        const time = x / 380;
        t.update(x, time, 380);
        for (const c of t.level.crates) if (!before.has(c) && c.loot?.kind === 'mount') times.push(time);
      }
      for (const tm of times) expect(tm).toBeGreaterThanOrEqual(CRATE_LOOT.mountAfter - 5);
      count += times.length;
    }
    expect(count).toBeGreaterThan(3);
  });

  it('quebrar o caixote solta a ema; pulando nela, a capivara monta e fica mais rápida', () => {
    const { e, l, events } = flat();
    const x = e.runner.x + 70;
    l.crates.push({ x0: x, x1: x + 36, top: 36, broken: false, brokenAt: 0, loot: { kind: 'mount', animal: 'ema' } });
    run(e, 0.6);
    expect(mounts(events, 'appear')).toHaveLength(1);
    expect(e.mount?.state).toBe('free');
    // Espera a ema assentar à frente e pula.
    run(e, 0.6);
    e.setHolding(true);
    run(e, 0.1);
    e.setHolding(false);
    run(e, 1);
    expect(mounts(events, 'ride')).toHaveLength(1);
    expect(e.riding).toBe(true);
    run(e, 1);
    expect(e.speedFactor).toBeCloseTo(1 + MOUNTS.ema.speed, 5);
  });

  it('montada pula mais alto', () => {
    const apex = (ride: boolean) => {
      const { e } = flat();
      if (ride) ridden(e);
      e.setHolding(true);
      let top = 0;
      for (let i = 0; i < 120; i++) {
        e.step(DT);
        top = Math.max(top, e.runner.y);
      }
      return top;
    };
    expect(apex(true)).toBeGreaterThan(apex(false) + 30);
  });

  it('bater numa pedra montada: cai da ema sem perder vida, a pedra quebra e a ema foge', () => {
    const { e, l, events } = flat();
    ridden(e);
    const x = e.runner.x + 80;
    l.rocks.push({ x0: x, x1: x + 34, top: 30, variant: 0, broken: false });
    run(e, 1.5);
    expect(e.state).toBe(GameState.PLAYING);
    expect(mounts(events, 'off').some((ev) => ev.type === 'mount' && ev.reason === 'hit')).toBe(true);
    expect(e.riding).toBe(false);
    expect(e.mount?.state ?? 'fleeing').toBe('fleeing');
    // Sem a ema, a velocidade volta ao normal.
    expect(e.speedFactor).toBeCloseTo(1, 5);
  });

  it('a ema fugindo dispara para frente e some', () => {
    const { e, l } = flat();
    ridden(e);
    l.rocks.push({ x0: e.runner.x + 60, x1: e.runner.x + 94, top: 30, variant: 0, broken: false });
    run(e, 0.6);
    const m = e.mount!;
    expect(m.state).toBe('fleeing');
    const gap0 = m.x - e.runner.x;
    run(e, 0.5);
    expect(m.x - e.runner.x).toBeGreaterThan(gap0 + 100);
    run(e, 6);
    expect(e.mount).toBeNull();
  });

  it('atravessar caixote montada: cai da ema mas não fica lenta', () => {
    const { e, l, events } = flat();
    ridden(e);
    const x = e.runner.x + 60;
    l.crates.push({ x0: x, x1: x + 36, top: 36, broken: false, brokenAt: 0 });
    run(e, 0.6);
    expect(mounts(events, 'off')).toHaveLength(1);
    expect(e.runner.slow).toBe(1);
  });

  it('caindo no rio montada, a ema arremessa a capivara para cima (segunda chance)', () => {
    const { e, l, events } = flat();
    ridden(e);
    l.ground.length = 0;
    l.addGround(-800, e.runner.x + 40);
    l.addGround(e.runner.x + 400, 40_000);
    let launched = false;
    for (let i = 0; i < 120 && e.state === GameState.PLAYING; i++) {
      e.step(DT);
      if (e.runner.vy > JUMP.jumpVelocity) launched = true;
    }
    expect(launched).toBe(true);
    expect(mounts(events, 'off').some((ev) => ev.type === 'mount' && ev.reason === 'river')).toBe(true);
  });

  it('a ema não entra na toca: a capivara cai sozinha', () => {
    const { e, l, events } = flat();
    ridden(e);
    const x0 = e.runner.x + 60;
    l.ground.length = 0;
    l.addGround(-800, x0);
    l.addGround(x0 + 150, x0 + 1200);
    l.addGround(x0 + 1350, 40_000);
    l.burrows.push({ x0, holeEnd: x0 + 150, exitStart: x0 + 1200, x1: x0 + 1350, floor: TOCA.floor, roof: TOCA.roof, opened: false });
    run(e, 0.8);
    expect(e.inBurrow).toBe(true);
    expect(e.riding).toBe(false);
    expect(mounts(events, 'off').some((ev) => ev.type === 'mount' && ev.reason === 'toca')).toBe(true);
  });

  it('a ema solta espera um tempo e depois vai embora', () => {
    const { e, events } = flat();
    e.mount = { animal: 'ema', state: 'free', x: e.runner.x + 50, y: 0, vy: 0, t: 0 };
    run(e, MOUNT.freeTime + 0.2);
    expect(mounts(events, 'off').some((ev) => ev.type === 'mount' && ev.reason === 'timeout')).toBe(true);
  });

  it('o enxame pega mesmo montada', () => {
    const { e } = flat();
    ridden(e);
    e.swarm = 1;
    e.runner.slow = 0.2;
    run(e, 1);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.deathCause).toBe('swarm');
  });
});

describe('anta (montaria)', () => {
  function antaRidden(e: Engine) {
    e.mount = { animal: 'anta', state: 'ridden', x: e.runner.x, y: 0, vy: 0, t: 0 };
  }

  it('atropela caixotes e espinhos sem cair', () => {
    const { e, l, events } = flat();
    antaRidden(e);
    const x = e.runner.x;
    l.crates.push({ x0: x + 60, x1: x + 96, top: 36, broken: false, brokenAt: 0 });
    l.thorns.push({ x0: x + 200, x1: x + 290, top: 24, broken: false });
    run(e, 1.2);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.riding).toBe(true);
    expect(mounts(events, 'off')).toHaveLength(0);
    expect(e.runner.slow).toBe(1);
    expect(l.crates[0]?.broken ?? true).toBe(true);
  });

  it('só a pedra derruba da anta', () => {
    const { e, l, events } = flat();
    antaRidden(e);
    l.rocks.push({ x0: e.runner.x + 80, x1: e.runner.x + 114, top: 30, variant: 0, broken: false });
    run(e, 1);
    expect(e.state).toBe(GameState.PLAYING);
    expect(mounts(events, 'off').some((ev) => ev.type === 'mount' && ev.reason === 'hit' && ev.animal === 'anta')).toBe(true);
  });

  it('montada na anta: +15% (menos que a ema) e pulo normal', () => {
    const { e, l } = flat();
    const x = e.runner.x + 70;
    l.crates.push({ x0: x, x1: x + 36, top: 36, broken: false, brokenAt: 0, loot: { kind: 'mount', animal: 'anta' } });
    run(e, 1.2);
    e.setHolding(true);
    run(e, 0.1);
    e.setHolding(false);
    run(e, 2);
    expect(e.riding).toBe(true);
    expect(e.speedFactor).toBeCloseTo(1 + MOUNTS.anta.speed, 5);
    expect(MOUNTS.anta.speed).toBeLessThan(MOUNTS.ema.speed);
  });

  it('caixotes de montaria sorteiam ema, anta e tucano', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 10; seed++) {
      const t = new Track(createRng(seed));
      for (let x = 0; x < 150_000; x += 400) {
        t.update(x, x / 380, 380);
        for (const c of t.level.crates) if (c.loot?.kind === 'mount') seen.add(c.loot.animal);
      }
    }
    expect([...seen].sort()).toEqual(['anta', 'ema', 'tucano']);
  });
});

describe('tucano (montaria que voa)', () => {
  function tucanoRidden(e: Engine) {
    e.mount = { animal: 'tucano', state: 'ridden', x: e.runner.x, y: 0, vy: 0, t: 0 };
  }

  it('solto, voa à frente; pulando até ele, a capivara é carregada', () => {
    const { e, l, events } = flat();
    const x = e.runner.x + 70;
    l.crates.push({ x0: x, x1: x + 36, top: 36, broken: false, brokenAt: 0, loot: { kind: 'mount', animal: 'tucano' } });
    run(e, 1.2);
    expect(e.mount?.state).toBe('free');
    expect(e.mount!.y).toBeGreaterThan(5);
    e.setHolding(true);
    run(e, 0.05);
    e.setHolding(false);
    run(e, 0.6);
    expect(mounts(events, 'ride').some((ev) => ev.type === 'mount' && ev.animal === 'tucano')).toBe(true);
    run(e, 1);
    expect(e.speedFactor).toBeCloseTo(1 + MOUNTS.tucano.speed, 5);
  });

  it('segurando, voa até o teto; soltando, desce devagar', () => {
    const { e } = flat();
    tucanoRidden(e);
    e.setHolding(true);
    run(e, 0.05);
    run(e, 1.5);
    const fly = MOUNTS.tucano.jump.fly!;
    expect(e.runner.y).toBeCloseTo(fly.ceiling, 3);
    e.setHolding(false);
    run(e, 0.3);
    expect(e.runner.vy).toBeGreaterThanOrEqual(-fly.maxFall - 1);
    expect(e.runner.y).toBeGreaterThan(fly.ceiling - 120);
  });

  it('voando, passa por cima de pedras e rios', () => {
    const { e, l } = flat();
    tucanoRidden(e);
    const x = e.runner.x;
    l.ground.length = 0;
    l.addGround(-800, x + 200);
    l.addGround(x + 900, 40_000);
    l.rocks.push({ x0: x + 1000, x1: x + 1046, top: 50, variant: 0, broken: false });
    e.setHolding(true);
    run(e, 0.05);
    run(e, 4.5);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.riding).toBe(true);
    expect(e.runner.x).toBeGreaterThan(x + 1100);
  });

  it('cansa depois de um tempo: desce e deixa a capivara no chão', () => {
    const { e, events } = flat();
    tucanoRidden(e);
    e.setHolding(true);
    run(e, 0.05);
    run(e, MOUNT.tucanoTime + 0.5);
    expect(e.tucanoTired || !e.riding).toBe(true);
    e.setHolding(false);
    run(e, 2);
    expect(e.riding).toBe(false);
    expect(mounts(events, 'off').some((ev) => ev.type === 'mount' && ev.reason === 'tired')).toBe(true);
    expect(e.state).toBe(GameState.PLAYING);
  });

  it('bater numa pedra carregada pelo tucano derruba (sem perder vida)', () => {
    const { e, l, events } = flat();
    tucanoRidden(e);
    l.rocks.push({ x0: e.runner.x + 80, x1: e.runner.x + 114, top: 30, variant: 0, broken: false });
    run(e, 1);
    expect(e.state).toBe(GameState.PLAYING);
    expect(mounts(events, 'off').some((ev) => ev.type === 'mount' && ev.reason === 'hit')).toBe(true);
  });
});

describe('tucano: trilhas de capim no céu', () => {
  const sky = (e: Engine, x0: number) => e.track.level.fruits.filter((f) => f.x > x0 && f.y > 60);

  it('voando de tucano aparecem trilhas no céu, com subidas que o tucano alcança', async () => {
    const { SKY_TRAIL } = await import('../game/config');
    const { e, l } = flat();
    l.fruits.length = 0;
    e.mount = { animal: 'tucano', state: 'ridden', x: e.runner.x, y: 0, vy: 0, t: 0 };
    const x0 = e.runner.x;
    run(e, 0.1);
    expect(e.skyMode).toBe(true);
    const trail = sky(e, x0).sort((a, b) => a.x - b.x);
    expect(trail.length).toBeGreaterThan(15);
    for (const f of trail) {
      expect(f.y - 17).toBeGreaterThanOrEqual(SKY_TRAIL.low - 0.01);
      expect(f.y - 17).toBeLessThanOrEqual(SKY_TRAIL.high + 0.01);
    }
    for (let i = 1; i < trail.length; i++) {
      const dx = trail[i].x - trail[i - 1].x;
      if (dx > SKY_TRAIL.spacing + 1) continue; // respiro entre trilhas
      expect(Math.abs(trail[i].y - trail[i - 1].y) / dx).toBeLessThanOrEqual(SKY_TRAIL.maxSlope + 0.01);
    }
  });

  it('sem tucano não há trilhas no céu; quando ele cansa, param de aparecer', () => {
    const { e, l } = flat();
    l.fruits.length = 0;
    run(e, 1);
    expect(e.skyMode).toBe(false);
    expect(sky(e, 0)).toHaveLength(0);
    e.mount = { animal: 'tucano', state: 'ridden', x: e.runner.x, y: 0, vy: 0, t: MOUNT.tucanoTime + 1 };
    run(e, 0.2);
    expect(e.skyMode).toBe(false);
    expect(sky(e, 0)).toHaveLength(0);
  });

  it('dá para pegar boa parte da trilha guiando o tucano', () => {
    const { e, l } = flat();
    l.fruits.length = 0;
    e.mount = { animal: 'tucano', state: 'ridden', x: e.runner.x, y: 0, vy: 0, t: 0 };
    run(e, 0.05);
    const before = e.score.fruits;
    // Piloto simples: segura quando o próximo capim está acima, solta quando abaixo.
    for (let i = 0; i < 6 / DT && e.state === GameState.PLAYING; i++) {
      const r = e.runner;
      const next = l.fruits.find((f) => !f.taken && f.x > r.x + 10 && f.y > 60);
      e.setHolding(!!next && next.y - 17 > r.y + 2);
      e.step(DT);
    }
    const total = l.fruits.filter((f) => f.y > 60).length;
    expect(e.score.fruits - before).toBeGreaterThan(total * 0.6);
  });
});
