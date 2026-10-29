import { describe, expect, it } from 'vitest';
import { DAY_CYCLE, RAIN, SEASONS } from '../game/config';
import { blendPalette, dayAt, mixHex, PALETTES, sceneryAt, weightOf } from '../rendering/scenery';
import { isRainy, Weather } from '../rendering/weather';

describe('Estações do ano', () => {
  it('começa no verão e passa por outono, inverno e primavera, em ciclo', () => {
    const at = (i: number) => sceneryAt(i * SEASONS.length + 1).from;
    expect([0, 1, 2, 3, 4, 5].map(at)).toEqual(['verao', 'outono', 'inverno', 'primavera', 'verao', 'outono']);
  });

  it('cada estação vai virando a próxima aos poucos', () => {
    const start = SEASONS.length - SEASONS.blend;
    expect(sceneryAt(start - 1)).toEqual({ from: 'verao', to: 'verao', t: 0 });
    const ts = [0.25, 0.5, 0.75].map((f) => sceneryAt(start + SEASONS.blend * f));
    for (const s of ts) expect(s).toMatchObject({ from: 'verao', to: 'outono' });
    expect(ts[0].t).toBeLessThan(ts[1].t);
    expect(ts[1].t).toBeLessThan(ts[2].t);
    expect(weightOf(sceneryAt(SEASONS.length + 1), 'outono')).toBe(1);
    expect(weightOf(sceneryAt(SEASONS.length + 1), 'verao')).toBe(0);
  });

  it('as cores misturam suavemente entre as paletas', () => {
    expect(blendPalette(sceneryAt(1))).toEqual(PALETTES.verao);
    const mid = blendPalette(sceneryAt(SEASONS.length - SEASONS.blend / 2));
    expect(mid.skyTop).not.toBe(PALETTES.verao.skyTop);
    expect(mid.skyTop).not.toBe(PALETTES.outono.skyTop);
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('Hora do dia', () => {
  const L = DAY_CYCLE.length;
  it('dia → entardecer → noite → amanhecer → dia, em ciclo', () => {
    const labels = [0.1, 0.5, 0.7, 0.9, 1.1].map((f) => dayAt(L * f).label);
    expect(labels).toEqual(['dia', 'entardecer', 'noite', 'amanhecer', 'dia']);
    expect(dayAt(0).night).toBe(0);
    expect(dayAt(L * 0.7).night).toBe(1);
    expect(dayAt(L * 2 + 1).label).toBe('dia');
  });

  it('anoitece aos poucos', () => {
    const n = [0.44, 0.5, 0.56, 0.6].map((f) => dayAt(L * f).night);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeGreaterThanOrEqual(n[i - 1]);
    expect(n[0]).toBeLessThan(0.2);
    expect(n[3]).toBe(1);
  });

  it('à noite o céu escurece, mas as barreiras continuam visíveis', () => {
    const night = blendPalette(sceneryAt(1), dayAt(L * 0.7));
    expect(night.skyTop).not.toBe(PALETTES.verao.skyTop);
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(night.barrier)).toBeGreaterThan(lum(PALETTES.verao.barrier) * 0.75);
    expect(lum(night.skyTop)).toBeLessThan(lum(PALETTES.verao.skyTop) * 0.5);
  });

  it('estação e hora do dia não andam juntas (as combinações variam)', () => {
    expect(DAY_CYCLE.length % SEASONS.length).not.toBe(0);
  });
});

describe('Chuva às vezes', () => {
  it('começo sempre seco e mesma agenda para a mesma partida', () => {
    for (let run = 1; run <= 50; run++) expect(isRainy(RAIN.dryStart - 1, run)).toBe(false);
    expect(isRainy(500, 7)).toBe(isRainy(500, 7));
  });

  it('chove em parte dos trechos, não sempre', () => {
    let rainy = 0;
    let total = 0;
    for (let run = 1; run <= 60; run++) {
      for (let seg = 1; seg < 20; seg++) {
        rainy += isRainy(seg * RAIN.segment + 5, run) ? 1 : 0;
        total++;
      }
    }
    expect(rainy / total).toBeGreaterThan(0.18);
    expect(rainy / total).toBeLessThan(0.42);
  });

  it('a chuva chega e vai embora aos poucos', () => {
    const w = new Weather();
    w.update(0.1, true, false);
    expect(w.started).toBe(true);
    expect(w.rain).toBeGreaterThan(0);
    expect(w.rain).toBeLessThan(0.1);
    for (let i = 0; i < 40; i++) w.update(0.1, true, false);
    expect(w.rain).toBe(1);
    for (let i = 0; i < 10; i++) w.update(0.1, false, false);
    expect(w.rain).toBeGreaterThan(0);
    expect(w.rain).toBeLessThan(1);
  });
});
