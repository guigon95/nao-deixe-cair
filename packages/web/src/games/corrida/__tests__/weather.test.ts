import { describe, expect, it } from 'vitest';
import { paletteAt, SEASONS } from '../rendering/palette';
import { RAIN, rainAt, rainWindow, Weather } from '../rendering/weather';

describe('chuva e nevasca', () => {
  it('começo sempre seco; agenda determinística por partida', () => {
    for (let run = 1; run <= 50; run++) for (let m = 0; m < RAIN.dryStart; m += 10) expect(rainAt(m, run)).toBe(0);
    expect(rainAt(2000, 7)).toBe(rainAt(2000, 7));
  });

  it('nunca chove durante uma troca de estação (nem perto dela)', () => {
    for (let run = 1; run <= 200; run++) {
      for (let i = 0; i < 8; i++) {
        const w = rainWindow(i, run);
        if (!w) continue;
        const base = i * SEASONS.length;
        expect(w.start).toBeGreaterThanOrEqual(base + RAIN.margin - 1e-6);
        expect(w.end).toBeLessThanOrEqual(base + SEASONS.length - SEASONS.blend - RAIN.margin + 1e-6);
        // Durante a chuva, o cenário está "parado" numa estação só.
        for (let m = w.start; m <= w.end; m += 20) {
          const p = paletteAt(m);
          expect(p.winter === 0 || p.winter === 1).toBe(true);
          expect(p.autumn === 0 || p.autumn === 1).toBe(true);
          expect(p.spring === 0 || p.spring === 1).toBe(true);
        }
      }
    }
  });

  it('chove às vezes (cerca de metade das estações) e muda entre partidas', () => {
    let rainy = 0;
    const patterns = new Set<string>();
    for (let run = 1; run <= 200; run++) {
      let p = '';
      for (let i = 1; i <= 8; i++) {
        const r = !!rainWindow(i, run);
        rainy += r ? 1 : 0;
        p += r ? '1' : '0';
      }
      patterns.add(p);
    }
    expect(rainy / 1600).toBeGreaterThan(0.35);
    expect(rainy / 1600).toBeLessThan(0.65);
    expect(patterns.size).toBeGreaterThan(80);
  });

  it('a intensidade sobe e desce aos poucos pela distância', () => {
    let run = 1;
    while (!rainWindow(1, run)) run++;
    const w = rainWindow(1, run)!;
    expect(rainAt(w.start + 1, run)).toBeLessThan(0.05);
    expect(rainAt((w.start + w.end) / 2, run)).toBe(1);
    expect(rainAt(w.end - 1, run)).toBeLessThan(0.05);
  });

  it('o estado visual segue a intensidade e avisa quando começa', () => {
    const wx = new Weather();
    wx.update(0.016, 0.02, false);
    expect(wx.started).toBe(true);
    for (let i = 0; i < 120; i++) wx.update(0.016, 1, false);
    expect(wx.rain).toBeGreaterThan(0.95);
    for (let i = 0; i < 240; i++) wx.update(0.016, 0, false);
    expect(wx.rain).toBe(0);
  });

  it('com menos movimento, trovão sem clarão', () => {
    const wx = new Weather();
    let thunders = 0;
    for (let i = 0; i < 60 * 40; i++) {
      wx.update(1 / 60, 1, true);
      if (wx.thunder) thunders++;
      expect(wx.lightning).toBe(0);
    }
    expect(thunders).toBeGreaterThan(0);
  });
});
