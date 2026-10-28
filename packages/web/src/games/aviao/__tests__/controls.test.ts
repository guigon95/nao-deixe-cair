import { describe, expect, it } from 'vitest';
import { createScheme, SCHEME_B, SCHEME_C, schemeFromUrl, SchemeB } from '../game/Controls';
import { createPlane } from '../game/Plane';
import { compareControls } from '../game/testing/compareControls';

describe('esquemas de controle', () => {
  it('padrão é o esquema C; ?controle=a e ?controle=b ligam os outros', () => {
    expect(schemeFromUrl('')).toBe('c');
    expect(schemeFromUrl('?controle=a')).toBe('a');
    expect(schemeFromUrl('?controle=b')).toBe('b');
    expect(schemeFromUrl('?controle=x')).toBe('c');
  });

  it('C: segurar sobe num ângulo firme; soltar corta o motor e empurra para o mergulho', () => {
    const c = createScheme('c');
    const p = createPlane(0, 0, 250);
    c.press(0);
    const cmd = c.command(0, p);
    expect(cmd.throttle).toBe(1);
    expect(cmd.pull).toBeGreaterThan(0.5); // nivelado: puxa para subir
    p.phi = SCHEME_C.climbAngle + 0.3; // passou do ângulo: empurra de leve
    expect(c.command(0, p).pull).toBeLessThan(0);
    c.release(1);
    const free = c.command(1, p);
    expect(free.throttle).toBe(0);
    expect(free.pull).toBeLessThan(0); // nariz para baixo, como a bolinha caindo
    p.phi = -SCHEME_C.diveAngle; // já no ângulo de mergulho: não empurra mais
    p.turnRate = 0;
    expect(Math.abs(c.command(1.1, p).pull)).toBeLessThan(0.05);
  });

  it('C: toque + toque-e-segure = loop (puxada total até passar da volta)', () => {
    const c = createScheme('c');
    const p = createPlane(0, 0, 250);
    c.press(0);
    c.release(0.1);
    c.press(0.25);
    // Ainda não confirmou: é um "segurar" normal (no ângulo de subida, quase não puxa).
    p.phi = SCHEME_C.climbAngle;
    p.speed = 400; // rápido: o ângulo de subida é o máximo
    expect(Math.abs(c.command(0.3, p).pull)).toBeLessThan(0.1);
    expect(c.gestures).toBe(0);
    expect(c.command(0.25 + SCHEME_C.holdConfirm, p)).toEqual({ throttle: 1, pull: 1 });
    expect(c.gestures).toBe(1);
    c.release(0.8);
    p.phi = 3; // no meio do loop, mesmo sem tocar, continua puxando
    expect(c.command(0.9, p).pull).toBe(1);
    const start = SCHEME_C.climbAngle; // ângulo em que o loop começou
    p.phi = start + Math.PI * 2 - 0.05; // quase: continua puxando até passar da volta
    expect(c.command(1, p).pull).toBe(1);
    p.phi = start + Math.PI * 2 + SCHEME_C.loopOvershoot; // completou: volta ao controle normal (solto = mergulho)
    expect(c.command(1.1, p).throttle).toBe(0);
  });

  it('C: dois toques curtos (ritmo frenético) não dão loop', () => {
    const c = createScheme('c');
    const p = createPlane(0, 0, 250);
    for (let i = 0; i < 20; i++) {
      const t = i * 0.25;
      c.press(t);
      c.command(t + 0.05, p);
      c.command(t + 0.12, p);
      c.release(t + 0.14);
    }
    expect(c.gestures).toBe(0);
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

  it('comparação: o esquema C atende aos critérios', () => {
    const [a, b, c] = compareControls(30);
    // resposta imediata (≤ 50 ms até o nariz girar 5°)
    expect(c.responseMs).toBeLessThanOrEqual(50);
    // loop de propósito com toque + toque-e-segure
    expect(c.loopSuccess).toBeGreaterThanOrEqual(0.95);
    // segurar sobe alto e nunca vira loop (o problema do esquema A)
    expect(c.hold3Loop).toBe(false);
    expect(a.hold3Loop).toBe(true);
    expect(c.hold3Climb).toBeGreaterThan(a.hold3Climb * 2);
    // toques frenéticos quase não disparam loop sem querer
    expect(c.accidentalPerMinute).toBeLessThan(3);
    expect(c.accidentalPerMinute).toBeLessThan(b.accidentalPerMinute);
  });
});
