import { describe, expect, it } from 'vitest';
import { DASH, SIM } from '../game/config';
import { Engine } from '../game/Engine';
import { pickKind } from '../game/Track';
import { GameState, type GameEvent } from '../game/types';
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

describe('açaí', () => {
  it('pegar o açaí enche o medidor e libera a Disparada', () => {
    const { e, l, events } = flat();
    expect(e.meter).toBe(0);
    expect(e.dash()).toBe(false);
    l.powerups.push({ x: e.runner.x + 50, y: 17, kind: 'acai', taken: false });
    run(e, 0.5);
    expect(e.meter).toBe(DASH.meterMax);
    expect(e.meterFull).toBe(true);
    expect(events.some((ev) => ev.type === 'acai')).toBe(true);
    expect(e.dash()).toBe(true);
  });

  it('o açaí não passa do máximo e some depois de pego', () => {
    const { e, l } = flat();
    e.meter = DASH.meterMax - 2;
    const u = { x: e.runner.x + 50, y: 17, kind: 'acai' as const, taken: false };
    l.powerups.push(u);
    run(e, 0.5);
    expect(e.meter).toBe(DASH.meterMax);
    expect(u.taken).toBe(true);
  });

  it('o sorteio dos itens inclui o açaí', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 100; i++) kinds.add(pickKind(i / 100));
    expect(kinds.has('acai')).toBe(true);
  });
});
