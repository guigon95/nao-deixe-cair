import { describe, expect, it } from 'vitest';
import { keyDir, SwipeInput, swipeDir } from '../game/Swipe';
import type { Dir } from '../game/types';

describe('deslize', () => {
  it('reconhece as quatro direções', () => {
    expect(swipeDir(30, 2)).toBe('right');
    expect(swipeDir(-30, 4)).toBe('left');
    expect(swipeDir(3, 30)).toBe('down');
    expect(swipeDir(-2, -30)).toBe('up');
  });

  it('ignora toques curtos e diagonais ambíguas', () => {
    expect(swipeDir(5, 3)).toBeNull();
    expect(swipeDir(20, 20)).toBeNull();
  });

  it('um gesto em "L" vira duas curvas, sem tirar o dedo', () => {
    const handlers = new Map<string, (e: PointerEvent) => void>();
    const target = {
      addEventListener: (t: string, fn: (e: PointerEvent) => void) => handlers.set(t, fn),
      removeEventListener: (t: string) => handlers.delete(t),
    };
    const dirs: Dir[] = [];
    const sw = new SwipeInput(target, (d) => dirs.push(d));
    const ev = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, target: null }) as unknown as PointerEvent;
    handlers.get('pointerdown')!(ev(100, 100));
    handlers.get('pointermove')!(ev(100, 70)); // sobe
    handlers.get('pointermove')!(ev(70, 70)); // vai para a esquerda
    handlers.get('pointerup')!(ev(70, 70));
    handlers.get('pointermove')!(ev(0, 0)); // sem dedo: nada
    expect(dirs).toEqual(['up', 'left']);
    sw.setEnabled(false);
    handlers.get('pointerdown')!(ev(0, 0));
    handlers.get('pointermove')!(ev(0, 50));
    expect(dirs.length).toBe(2);
    sw.dispose();
    expect(handlers.size).toBe(0);
  });
});

describe('teclado', () => {
  it('setas e WASD', () => {
    expect(keyDir('ArrowUp')).toBe('up');
    expect(keyDir('KeyA')).toBe('left');
    expect(keyDir('KeyS')).toBe('down');
    expect(keyDir('ArrowRight')).toBe('right');
    expect(keyDir('Space')).toBeNull();
  });
});
