import { describe, expect, it } from 'vitest';
import { ARENA } from '../game/config';
import { InputController } from '../../../shared/input/InputController';
import { computeLayout, effectiveDpr, screenToArena } from '../../../shared/layout/layout';

function pointer(type: string, props: Record<string, unknown> = {}) {
  const e = new Event(type, { cancelable: true });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'touch', button: 0, ...props }))
    Object.defineProperty(e, k, { value: v });
  return e;
}
function key(type: string, code: string) {
  const e = new Event(type, { cancelable: true });
  Object.defineProperty(e, 'code', { value: code });
  return e;
}

function setup() {
  const surface = new EventTarget();
  const win = new EventTarget();
  const changes: boolean[] = [];
  const input = new InputController(surface, win, (h) => changes.push(h));
  return { surface, win, input, changes };
}

describe('Controles (Pointer Events)', () => {
  it('pressionar segura; soltar solta', () => {
    const { surface, input, changes } = setup();
    const down = pointer('pointerdown');
    surface.dispatchEvent(down);
    expect(input.isHolding).toBe(true);
    expect(down.defaultPrevented).toBe(true); // bloqueia gestos nativos na superfície
    surface.dispatchEvent(pointer('pointerup'));
    expect(input.isHolding).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('pointercancel e lostpointercapture soltam o controle', () => {
    const { surface, input } = setup();
    surface.dispatchEvent(pointer('pointerdown'));
    surface.dispatchEvent(pointer('pointercancel'));
    expect(input.isHolding).toBe(false);
    surface.dispatchEvent(pointer('pointerdown', { pointerId: 2 }));
    surface.dispatchEvent(pointer('lostpointercapture', { pointerId: 2 }));
    expect(input.isHolding).toBe(false);
  });

  it('vários dedos: segura enquanto houver pelo menos um', () => {
    const { surface, input, changes } = setup();
    surface.dispatchEvent(pointer('pointerdown', { pointerId: 1 }));
    surface.dispatchEvent(pointer('pointerdown', { pointerId: 2 }));
    surface.dispatchEvent(pointer('pointerup', { pointerId: 1 }));
    expect(input.isHolding).toBe(true);
    surface.dispatchEvent(pointer('pointerup', { pointerId: 2 }));
    expect(input.isHolding).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('mouse: só o botão principal; soltar fora da área também solta', () => {
    const { surface, win, input } = setup();
    surface.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', button: 2 }));
    expect(input.isHolding).toBe(false);
    surface.dispatchEvent(pointer('pointerdown', { pointerType: 'mouse', button: 0 }));
    expect(input.isHolding).toBe(true);
    win.dispatchEvent(pointer('pointerup', { pointerType: 'mouse' }));
    expect(input.isHolding).toBe(false);
  });

  it('perda de foco solta tudo', () => {
    const { surface, win, input } = setup();
    surface.dispatchEvent(pointer('pointerdown'));
    win.dispatchEvent(key('keydown', 'Space'));
    win.dispatchEvent(new Event('blur'));
    expect(input.isHolding).toBe(false);
  });

  it('teclado (Espaço/↑) também controla', () => {
    const { win, input } = setup();
    const k = key('keydown', 'Space');
    win.dispatchEvent(k);
    expect(input.isHolding).toBe(true);
    expect(k.defaultPrevented).toBe(true); // não rola a página
    win.dispatchEvent(key('keyup', 'Space'));
    expect(input.isHolding).toBe(false);
    win.dispatchEvent(key('keydown', 'ArrowUp'));
    expect(input.isHolding).toBe(true);
  });

  it('desabilitado ignora toques e solta o que estava pressionado', () => {
    const { surface, input } = setup();
    surface.dispatchEvent(pointer('pointerdown'));
    input.setEnabled(false);
    expect(input.isHolding).toBe(false);
    surface.dispatchEvent(pointer('pointerdown', { pointerId: 5 }));
    expect(input.isHolding).toBe(false);
  });

  it('dispose remove todos os ouvintes', () => {
    const { surface, input, changes } = setup();
    input.dispose();
    surface.dispatchEvent(pointer('pointerdown'));
    expect(changes).toEqual([]);
  });

  it('menu de contexto (pressão longa) é bloqueado na superfície', () => {
    const { surface } = setup();
    const e = new Event('contextmenu', { cancelable: true });
    surface.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('Layout responsivo', () => {
  const sizes: Array<[number, number]> = [
    [320, 480], // celular pequeno
    [360, 640],
    [390, 844], // iPhone moderno
    [412, 915], // Android alto
    [768, 1024], // tablet retrato
    [1024, 768], // tablet paisagem
    [1920, 1080], // desktop
    [844, 390], // celular deitado
  ];

  it('a arena cabe inteira na tela, centralizada e sem esticar', () => {
    for (const [w, h] of sizes) {
      const l = computeLayout(w, h);
      const aw = ARENA.width * l.scale;
      const ah = ARENA.height * l.scale;
      expect(aw).toBeLessThanOrEqual(w + 1e-6);
      expect(ah).toBeLessThanOrEqual(h + 1e-6);
      expect(aw / ah).toBeCloseTo(ARENA.width / ARENA.height, 6); // proporção preservada
      expect(l.offsetX).toBeCloseTo((w - aw) / 2, 6);
      expect(l.offsetY).toBeCloseTo((h - ah) / 2, 6);
      // Encosta em pelo menos um eixo: usa o máximo de espaço possível.
      expect(Math.min(w - aw, h - ah)).toBeLessThan(1e-6);
    }
  });

  it('continua utilizável em telas pequenas (bolinha com ≥ 9 px de raio em 320×480)', () => {
    const l = computeLayout(320, 480);
    expect(12 * l.scale).toBeGreaterThanOrEqual(9);
  });

  it('detecta orientação muito horizontal', () => {
    expect(computeLayout(844, 390).landscape).toBe(true);
    expect(computeLayout(390, 844).landscape).toBe(false);
  });

  it('converte coordenadas de tela para a arena', () => {
    const l = computeLayout(720, 1280);
    const p = screenToArena(l, l.offsetX + 360, l.offsetY + 640);
    expect(p.x).toBeCloseTo(180, 6);
    expect(p.y).toBeCloseTo(320, 6);
  });

  it('devicePixelRatio é tratado e limitado', () => {
    expect(effectiveDpr(undefined)).toBe(1);
    expect(effectiveDpr(NaN)).toBe(1);
    expect(effectiveDpr(2)).toBe(2);
    expect(effectiveDpr(4)).toBe(2.5);
  });

  it('dimensões degeneradas (0×0 durante montagem) não geram NaN', () => {
    const l = computeLayout(0, 0);
    expect(Number.isFinite(l.scale)).toBe(true);
    expect(l.scale).toBeGreaterThan(0);
  });
});
