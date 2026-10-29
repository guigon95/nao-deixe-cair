import { describe, expect, it } from 'vitest';
import { isRainy, RAIN, Weather } from '../rendering/weather';

describe('chuva', () => {
  it('começo sempre seco; agenda determinística por partida', () => {
    for (let run = 1; run <= 50; run++) expect(isRainy(RAIN.dryStart - 1, run)).toBe(false);
    expect(isRainy(2000, 7)).toBe(isRainy(2000, 7));
  });

  it('chove às vezes: cerca de 30% dos trechos, e a agenda muda entre partidas', () => {
    let rainy = 0;
    let total = 0;
    const patterns = new Set<string>();
    for (let run = 1; run <= 200; run++) {
      let p = '';
      for (let seg = 1; seg <= 10; seg++) {
        const r = isRainy(seg * RAIN.segment + 10, run);
        rainy += r ? 1 : 0;
        total++;
        p += r ? '1' : '0';
      }
      patterns.add(p);
    }
    expect(rainy / total).toBeGreaterThan(0.2);
    expect(rainy / total).toBeLessThan(0.4);
    expect(patterns.size).toBeGreaterThan(100);
  });

  it('a chuva chega e vai embora aos poucos; avisa quando começa', () => {
    const w = new Weather();
    w.update(0.016, true, false);
    expect(w.started).toBe(true);
    expect(w.rain).toBeLessThan(0.05);
    for (let i = 0; i < 300; i++) w.update(0.016, true, false);
    expect(w.rain).toBe(1);
    expect(w.started).toBe(false);
    for (let i = 0; i < 60; i++) w.update(0.016, false, false);
    expect(w.rain).toBeGreaterThan(0.4);
    expect(w.rain).toBeLessThan(1);
  });

  it('com menos movimento, trovão sem clarão', () => {
    const w = new Weather();
    let thunders = 0;
    for (let i = 0; i < 60 * 40; i++) {
      w.update(1 / 60, true, true);
      if (w.thunder) thunders++;
      expect(w.lightning).toBe(0);
    }
    expect(thunders).toBeGreaterThan(0);
  });
});
