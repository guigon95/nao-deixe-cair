import { describe, expect, it } from 'vitest';
import { createScheme, SCHEME_B, schemeFromUrl, SchemeB } from '../game/Controls';
import { createPlane } from '../game/Plane';
import { compareControls } from '../game/testing/compareControls';

describe('esquemas de controle', () => {
  it('?controle=b escolhe o esquema B; qualquer outra coisa, o A', () => {
    expect(schemeFromUrl('?controle=b')).toBe('b');
    expect(schemeFromUrl('?controle=a')).toBe('a');
    expect(schemeFromUrl('')).toBe('a');
    expect(schemeFromUrl('?controle=x')).toBe('a');
  });

  it('A: segurar = potência e puxada total; soltar = nada, na hora', () => {
    const a = createScheme('a');
    const p = createPlane(0, 0, 200);
    expect(a.command(0, p)).toEqual({ throttle: 0, pull: 0 });
    a.press(0);
    expect(a.command(0, p)).toEqual({ throttle: 1, pull: 1 });
    a.release(0.05);
    expect(a.command(0.05, p)).toEqual({ throttle: 0, pull: 0 });
  });

  it('B: toque duplo dispara um tonneau; toques espaçados não', () => {
    const b = new SchemeB();
    b.press(0);
    b.release(0.08);
    b.press(0.2);
    b.release(0.27);
    expect(b.gestures).toBe(1);
    const c = new SchemeB();
    c.press(0);
    c.release(0.1);
    c.press(0.1 + SCHEME_B.doubleTapGap + 0.1);
    c.release(0.1 + SCHEME_B.doubleTapGap + 0.18);
    expect(c.gestures).toBe(0);
  });

  it('comparação: o esquema A atende aos critérios e vence o B', () => {
    const [a, b] = compareControls(30);
    // resposta imediata (≤ 2 quadros de 60 Hz até o nariz girar 5°)
    expect(a.responseMs).toBeLessThanOrEqual(50);
    // loop de propósito nas primeiras tentativas
    expect(a.loopSuccess).toBeGreaterThanOrEqual(0.95);
    // nenhuma manobra acidental ao bater na tela para manter o voo
    expect(a.accidentalPerMinute).toBe(0);
    expect(a.accidentalLoopsPerMinute).toBe(0);
    // o B tem gestos que disparam sem querer e loops menos confiáveis
    expect(b.accidentalPerMinute).toBeGreaterThan(a.accidentalPerMinute);
    expect(b.loopSuccess).toBeLessThan(a.loopSuccess);
  });
});
