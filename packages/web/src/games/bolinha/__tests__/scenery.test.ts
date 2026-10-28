import { describe, expect, it } from 'vitest';
import { SCENERY } from '../game/config';
import { blendPalette, mixHex, PALETTES, sceneryAt, weightOf } from '../rendering/scenery';

describe('Cenários por pontuação', () => {
  const selva = SCENERY.find((s) => s.id === 'selva')!;

  it('começa na noite e fica nela até a selva chegar', () => {
    expect(sceneryAt(0)).toEqual({ from: 'noite', to: 'noite', t: 0 });
    expect(sceneryAt(selva.at - 1).to).toBe('noite');
  });

  it('a selva entra aos poucos e depois toma a tela inteira', () => {
    const steps = [0, 0.25, 0.5, 0.75].map((f) => sceneryAt(selva.at + selva.over * f));
    for (const s of steps) expect(s).toMatchObject({ from: 'noite', to: 'selva' });
    const ts = steps.map((s) => s.t);
    expect(ts[0]).toBe(0);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThan(ts[i - 1]);
    expect(sceneryAt(selva.at + selva.over)).toEqual({ from: 'selva', to: 'selva', t: 0 });
    expect(weightOf(sceneryAt(5000), 'selva')).toBe(1);
    expect(weightOf(sceneryAt(5000), 'noite')).toBe(0);
  });

  it('as cores misturam suavemente entre as paletas', () => {
    expect(blendPalette(sceneryAt(0))).toEqual(PALETTES.noite);
    expect(blendPalette(sceneryAt(selva.at + selva.over))).toEqual(PALETTES.selva);
    const mid = blendPalette(sceneryAt(selva.at + selva.over / 2));
    expect(mid.skyTop).not.toBe(PALETTES.noite.skyTop);
    expect(mid.skyTop).not.toBe(PALETTES.selva.skyTop);
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('a agenda de cenários está em ordem crescente de pontos', () => {
    for (let i = 1; i < SCENERY.length; i++) expect(SCENERY[i].at).toBeGreaterThan(SCENERY[i - 1].at);
  });
});
