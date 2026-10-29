import { describe, expect, it } from 'vitest';
import { CRATE_LOOT, ITEMS, SIM } from '../game/config';
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
  l.addGround(-800, 20_000);
  e.track.genX = 20_000;
  return { e, l, events };
}

const run = (e: Engine, s: number) => {
  for (let i = 0; i < s / DT && e.state === GameState.PLAYING; i++) e.step(DT);
};

describe('caixotes com prêmio', () => {
  it('o gerador enche alguns caixotes com capim e poucos com item especial', () => {
    let total = 0;
    let capim = 0;
    let item = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const t = new Track(createRng(seed));
      for (let x = 0; x < 120_000; x += 400) {
        const before = new Set(t.level.crates);
        t.update(x, x / 380, 380);
        for (const c of t.level.crates) {
          if (before.has(c)) continue;
          total++;
          if (c.loot?.kind === 'capim') {
            capim++;
            expect(c.loot.n).toBeGreaterThanOrEqual(CRATE_LOOT.capimMin);
            expect(c.loot.n).toBeLessThanOrEqual(CRATE_LOOT.capimMax);
          } else if (c.loot?.kind === 'item') item++;
        }
      }
    }
    expect(total).toBeGreaterThan(100);
    expect(capim / total).toBeGreaterThan(0.3);
    expect(capim / total).toBeLessThan(0.6);
    expect(item / total).toBeGreaterThan(0.03);
    expect(item / total).toBeLessThan(0.2);
  });

  it('nada de item em caixote antes do tempo mínimo dos itens', () => {
    const t = new Track(createRng(3));
    t.update(0, 0, 290);
    for (const c of t.level.crates) expect(c.loot?.kind).not.toBe('item');
    expect(ITEMS.firstAfter).toBeGreaterThan(0);
  });

  it('o sorteio dos caixotes não muda o percurso (mesma semente, mesmos padrões)', () => {
    const a = new Track(createRng(9));
    const b = new Track(createRng(9));
    a.update(30_000, 80, 400);
    b.update(30_000, 80, 400);
    expect(a.history.map((h) => h.id)).toEqual(b.history.map((h) => h.id));
    expect(a.level.crates.map((c) => c.loot?.kind ?? '-')).toEqual(b.level.crates.map((c) => c.loot?.kind ?? '-'));
  });

  it('atravessar um caixote de capim: os capins saem e voam até a capivara', () => {
    const { e, l, events } = flat();
    const x = e.runner.x + 60;
    l.crates.push({ x0: x, x1: x + 36, top: 36, broken: false, brokenAt: 0, loot: { kind: 'capim', n: 4 } });
    run(e, 1.2);
    expect(e.state).toBe(GameState.PLAYING);
    expect(events.some((ev) => ev.type === 'loot' && ev.kind === 'capim' && ev.n === 4)).toBe(true);
    expect(e.score.fruits).toBe(4);
    expect(e.meter).toBe(4);
    expect(e.loot).toHaveLength(0);
  });

  it('pisar num caixote premiado: o item sai e é pego', () => {
    const { e, l } = flat();
    const x = e.runner.x + 10;
    l.crates.push({ x0: x, x1: x + 36, top: 36, broken: false, brokenAt: 0, loot: { kind: 'item', item: 'shield' } });
    // Caindo bem em cima do caixote.
    const r = e.runner;
    r.x = x + 12;
    r.prevX = r.x;
    r.y = r.prevY = 70;
    r.grounded = false;
    r.jumped = true;
    r.vy = -200;
    run(e, 1.5);
    const c = l.crates[0];
    expect(c?.broken ?? true).toBe(true);
    expect(e.shield).toBe(true);
  });

  it('caixote vazio não solta nada', () => {
    const { e, l, events } = flat();
    const x = e.runner.x + 60;
    l.crates.push({ x0: x, x1: x + 36, top: 36, broken: false, brokenAt: 0 });
    run(e, 1);
    expect(events.some((ev) => ev.type === 'loot')).toBe(false);
    expect(e.score.fruits).toBe(0);
  });
});
