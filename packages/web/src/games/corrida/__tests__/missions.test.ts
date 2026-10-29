import { describe, expect, it } from 'vitest';
import { drawTrio, MISSION_DEFS, Missions, missionText, targetFor, WINTER_METERS, type Mission } from '../game/Missions';
import { MemoryStorage } from '../../../shared/storage/storage';

function withTrio(slots: Array<Pick<Mission, 'kind' | 'target'>>) {
  const storage = new MemoryStorage();
  storage.setItem(
    'ndc:corrida:missions',
    JSON.stringify({ v: 1, level: 1, seed: 7, completed: 0, slots: slots.map((s) => ({ ...s, progress: 0, done: false })) }),
  );
  return { storage, m: new Missions(storage) };
}

describe('missões em trios', () => {
  it('começa no nível 1 com 3 missões diferentes e textos legíveis', () => {
    const m = new Missions(new MemoryStorage());
    expect(m.level).toBe(1);
    expect(m.slots).toHaveLength(3);
    expect(new Set(m.slots.map((s) => s.kind)).size).toBe(3);
    for (const s of m.slots) expect(missionText(s)).toMatch(/\d|inverno/);
  });

  it('"numa corrida" recomeça a cada partida; "no total" soma entre partidas', () => {
    const { m } = withTrio([
      { kind: 'capimRun', target: 5 },
      { kind: 'capimTotal', target: 8 },
      { kind: 'vines', target: 9 },
    ]);
    m.startRun();
    for (let i = 0; i < 4; i++) m.capim();
    m.endRun();
    m.startRun();
    expect(m.slots[0].progress).toBe(0);
    expect(m.slots[1].progress).toBe(4);
    for (let i = 0; i < 3; i++) m.capim();
    expect(m.slots[0].done).toBe(false);
    const done = [...m.capim(), ...m.capim()];
    expect(done.map((d) => d.kind).sort()).toEqual(['capimRun', 'capimTotal']);
    expect(m.slots[0].done && m.slots[1].done).toBe(true);
  });

  it('missão cumprida fica cumprida (não volta a zero na próxima corrida)', () => {
    const { m } = withTrio([
      { kind: 'meters', target: 100 },
      { kind: 'runs', target: 50 },
      { kind: 'vines', target: 9 },
    ]);
    m.startRun();
    expect(m.tick(120, 0).map((d) => d.kind)).toEqual(['meters']);
    m.endRun();
    m.startRun();
    expect(m.slots[0].done).toBe(true);
    expect(m.slots[0].progress).toBe(100);
  });

  it('sem caixote / sem dash contam metros desde a última batida/uso', () => {
    const { m } = withTrio([
      { kind: 'noCrate', target: 300 },
      { kind: 'noDash', target: 300 },
      { kind: 'runs', target: 50 },
    ]);
    m.startRun();
    m.tick(200, 0);
    m.crate(false);
    m.dash();
    m.tick(450, 0);
    expect(m.slots[0].done).toBe(false);
    expect(m.slots[1].done).toBe(false);
    m.crate(true); // pisar não conta como bater
    expect(m.tick(520, 0).map((d) => d.kind).sort()).toEqual(['noCrate', 'noDash']);
  });

  it('planar e chegar ao inverno', () => {
    const { m } = withTrio([
      { kind: 'glide', target: 2 },
      { kind: 'winter', target: 1 },
      { kind: 'runs', target: 50 },
    ]);
    m.startRun();
    for (let i = 0; i < 100; i++) m.tick(10, 1 / 60);
    expect(m.slots[0].done).toBe(false);
    for (let i = 0; i < 30; i++) m.tick(10, 1 / 60);
    expect(m.slots[0].done).toBe(true);
    m.tick(WINTER_METERS - 1, 0);
    expect(m.slots[1].done).toBe(false);
    m.tick(WINTER_METERS, 0);
    expect(m.slots[1].done).toBe(true);
  });

  it('trio completo sobe de nível no fim da corrida, com trio novo e mais difícil', () => {
    const { storage, m } = withTrio([
      { kind: 'capimRun', target: 1 },
      { kind: 'vines', target: 1 },
      { kind: 'runs', target: 1 },
    ]);
    m.startRun();
    m.capim();
    m.vine();
    const r = m.endRun();
    expect(r.leveledUp).toBe(true);
    expect(r.level).toBe(2);
    expect(m.slots.every((s) => !s.done && s.progress === 0)).toBe(true);
    // Salvo: outra instância lê o mesmo estado.
    const again = new Missions(storage);
    expect(again.level).toBe(2);
    expect(again.slots.map((s) => s.kind)).toEqual(m.slots.map((s) => s.kind));
    expect(again.state.completed).toBe(3);
  });

  it('alvos crescem com o nível e o sorteio respeita o nível mínimo', () => {
    for (const d of MISSION_DEFS) expect(targetFor(d, 5)).toBeGreaterThanOrEqual(targetFor(d, 1));
    for (let seed = 1; seed < 200; seed++) {
      const t = drawTrio(1, seed);
      expect(new Set(t.map((s) => s.kind)).size).toBe(3);
      for (const s of t) expect(MISSION_DEFS.find((d) => d.kind === s.kind)!.minLevel).toBe(1);
    }
  });

  it('dado estragado no aparelho não quebra: recomeça no nível 1', () => {
    const storage = new MemoryStorage();
    storage.setItem('ndc:corrida:missions', '{"v":1,"level":"x"');
    expect(new Missions(storage).level).toBe(1);
    storage.setItem('ndc:corrida:missions', JSON.stringify({ v: 1, level: 2, seed: 1, slots: [{ kind: 'voar', target: 1, progress: 0, done: false }] }));
    expect(new Missions(storage).level).toBe(1);
  });
});
