import { describe, expect, it } from 'vitest';
import { BIOME_BLEND, BIOME_LENGTH, biomeIndex, paletteAt, PALETTES } from '../rendering/palette';

describe('cenários pela distância', () => {
  it('o inverno na serra entra no ciclo conforme a capivara avança', () => {
    const names = PALETTES.map((p) => p.name);
    expect(names).toContain('INVERNO NA SERRA');
    const i = names.indexOf('INVERNO NA SERRA');
    expect(paletteAt(i * BIOME_LENGTH + BIOME_BLEND + 10).winter).toBe(1);
    expect(paletteAt(0).winter).toBe(0);
    // Ciclo: depois de todos os trechos, volta para o primeiro e o inverno volta de novo.
    expect(biomeIndex(PALETTES.length * BIOME_LENGTH + 5)).toBe(0);
    expect(paletteAt((PALETTES.length + i) * BIOME_LENGTH + BIOME_BLEND + 10).winter).toBe(1);
  });

  it('a chegada do inverno é gradual (mistura na transição)', () => {
    const i = PALETTES.findIndex((p) => p.winter === 1);
    const mid = paletteAt(i * BIOME_LENGTH + BIOME_BLEND / 2).winter;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });
});
