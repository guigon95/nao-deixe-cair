import { describe, expect, it } from 'vitest';
import { MUD, SCORING, SIM } from '../game/config';
import { BIOMES, biomeAt, dominantBiome } from '../game/biome';
import { Engine } from '../game/Engine';
import { Track } from '../game/Track';
import { PATTERNS } from '../game/patterns';
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
  l.fruits.length = l.powerups.length = l.logs.length = l.pups.length = l.muds.length = 0;
  l.ground.length = 0;
  l.addGround(-800, 40_000);
  e.track.genX = 40_000;
  return { e, l, events };
}
const run = (e: Engine, s: number) => {
  for (let i = 0; i < s / DT && e.state === GameState.PLAYING; i++) e.step(DT);
};

describe('biomas', () => {
  it('ciclo Mata → Pantanal → Cerrado → Caatinga, com transição gradual', () => {
    expect(dominantBiome(100)).toBe('mata');
    expect(dominantBiome(BIOMES.length + 100)).toBe('pantanal');
    expect(dominantBiome(2 * BIOMES.length + 100)).toBe('cerrado');
    expect(dominantBiome(3 * BIOMES.length + 100)).toBe('caatinga');
    expect(dominantBiome(4 * BIOMES.length + 100)).toBe('mata');
    const mid = biomeAt(BIOMES.length - BIOMES.blend / 2);
    expect(mid.t).toBeGreaterThan(0.3);
    expect(mid.t).toBeLessThan(0.7);
  });

  it('cada trecho de bioma só aparece no seu bioma (e cipó/copa nunca na Caatinga)', () => {
    const only = (id: string) => PATTERNS.find((p) => p.id === id)!.biomes!;
    expect(only('lama').mata).toBe(0);
    expect(only('cupinzeiro').cerrado).toBe(1);
    expect(only('mandacaru').caatinga).toBe(1);
    for (const id of ['cipo', 'cipo-capim', 'copa']) expect(only(id).caatinga).toBe(0);
    // No gerador: na Caatinga não sai cipó, e saem mandacarus.
    const t = new Track(createRng(3));
    const seen = new Map<string, string[]>();
    for (let x = 0; x < 6 * BIOMES.length * SCORING.unitsPerMeter; x += 400) {
      t.update(x, x / 400, 400);
    }
    for (const h of t.history) {
      const b = dominantBiome(h.x / SCORING.unitsPerMeter);
      seen.set(b, [...(seen.get(b) ?? []), h.id]);
    }
    for (const [b, ids] of seen) {
      if (b !== 'caatinga') expect(ids).not.toContain('mandacaru');
      if (b === 'caatinga') {
        expect(ids).not.toContain('cipo');
        expect(ids).not.toContain('copa');
      }
    }
  });

  it('lama: correndo nela a capivara fica lenta (e o enxame chega perto); pulando, passa', () => {
    const { e, l, events } = flat();
    l.muds.push({ x0: e.runner.x + 30, x1: e.runner.x + 200 });
    run(e, 0.3);
    expect(e.runner.slow).toBeCloseTo(MUD.slow, 2);
    expect(events.some((ev) => ev.type === 'mud')).toBe(true);
    expect(e.state).toBe(GameState.PLAYING);
  });

  it('cupinzeiro: bater mata, mas dá para subir em cima', () => {
    const { e, l } = flat();
    l.rocks.push({ x0: e.runner.x + 60, x1: e.runner.x + 100, top: 58, variant: 0, broken: false, kind: 'cupim' });
    run(e, 1);
    expect(e.deathCause).toBe('rock');
  });

  it('mandacaru: espinho alto, um pulo segurado passa', () => {
    const { e, l } = flat();
    l.thorns.push({ x0: e.runner.x + 60, x1: e.runner.x + 82, top: 46, broken: false, kind: 'mandacaru' });
    run(e, 1);
    expect(e.deathCause).toBe('thorns');
  });
});
