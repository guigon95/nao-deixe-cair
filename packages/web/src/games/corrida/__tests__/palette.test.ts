import { describe, expect, it } from 'vitest';
import { DAY, dayAt, dominantSeason, paletteAt, SEASONS, seasonAt } from '../rendering/palette';

const L = SEASONS.length;
const B = SEASONS.blend;

describe('estações e hora do dia pela distância', () => {
  it('as estações seguem a ordem real e repetem: verão → outono → inverno → primavera → verão', () => {
    const seq = [0, 1, 2, 3, 4, 5].map((i) => dominantSeason(i * L + 10));
    expect(seq).toEqual(['verao', 'outono', 'inverno', 'primavera', 'verao', 'outono']);
  });

  it('a chegada do inverno é lenta: começa centenas de metros antes e vai aos poucos', () => {
    expect(B).toBeGreaterThanOrEqual(250);
    const start = 2 * L - B; // começo da transição outono → inverno
    const w = (m: number) => paletteAt(m).winter;
    expect(w(start - 1)).toBe(0);
    expect(w(start + B * 0.25)).toBeGreaterThan(0);
    expect(w(start + B * 0.25)).toBeLessThan(0.3);
    expect(w(start + B * 0.5)).toBeGreaterThan(0.3);
    expect(w(start + B * 0.5)).toBeLessThan(0.7);
    expect(w(2 * L + 1)).toBe(1);
    // Nunca dá salto grande de um metro para o outro.
    let prev = w(start - 10);
    for (let m = start - 10; m <= 2 * L + 10; m += 1) {
      const v = w(m);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      prev = v;
    }
  });

  it('a mistura entre estações é sempre de vizinhas', () => {
    for (let m = 0; m < 8 * L; m += 37) {
      const s = seasonAt(m);
      const i = SEASONS.order.indexOf(s.from);
      expect(s.to).toBe(SEASONS.order[(i + 1) % 4]);
    }
  });

  it('o dia passa por entardecer, noite e amanhecer, e o começo é de dia', () => {
    expect(dayAt(0).a).toBe('dia');
    const seen = new Set<string>();
    for (let m = 0; m < DAY.length; m += 20) {
      const d = dayAt(m);
      seen.add(d.t < 0.5 ? d.a : d.b);
    }
    expect([...seen].sort()).toEqual(['amanhecer', 'dia', 'entardecer', 'noite']);
    expect(paletteAt(DAY.length * 0.7).stars).toBeGreaterThan(0.9);
  });

  it('sem vaga-lumes no inverno, mesmo de noite', () => {
    let m = 2 * L + 10;
    while (paletteAt(m).stars < 0.9 || paletteAt(m).winter < 1) m += 10;
    expect(paletteAt(m).fireflies).toBe(0);
  });
});
