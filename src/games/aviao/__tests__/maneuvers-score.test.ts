import { describe, expect, it } from 'vitest';
import { SCORING } from '../game/config';
import { ManeuverDetector, type Detected } from '../game/Maneuvers';
import { createPlane, type PlaneState } from '../game/Plane';
import { Score } from '../game/Score';
import type { ManeuverKind } from '../game/types';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = 1 / 120;

/** Trajetória sintética: `phiAt(t)`, `speedAt(t)`, `altAt(t)`, `stallAt(t)` durante `seconds`. */
function run(
  seconds: number,
  phiAt: (t: number) => number,
  opts: { speed?: (t: number) => number; alt?: (t: number) => number; stall?: (t: number) => number } = {},
) {
  const det = new ManeuverDetector();
  const p: PlaneState = createPlane(0, 300, 250);
  det.reset(phiAt(0));
  const found: Detected['kind'][] = [];
  for (let t = 0; t < seconds; t += DT) {
    p.phi = phiAt(t);
    p.speed = opts.speed ? opts.speed(t) : 250;
    p.stall = opts.stall ? opts.stall(t) : 0;
    for (const d of det.update(p, opts.alt ? opts.alt(t) : 200, DT)) found.push(d.kind);
  }
  return found;
}

const count = (arr: ManeuverKind[], k: ManeuverKind) => arr.filter((x) => x === k).length;

describe('detecção de manobras', () => {
  it('loop: 360° de rotação para cima', () => {
    const f = run(3, (t) => Math.min(t / 1.6, 1) * Math.PI * 2);
    expect(count(f, 'loop')).toBe(1);
  });

  it('dois loops seguidos contam dois', () => {
    const f = run(4, (t) => Math.min(t / 3, 1) * Math.PI * 4);
    expect(count(f, 'loop')).toBe(2);
  });

  it('meio loop: 180° e saída nivelada (invertido)', () => {
    const f = run(3, (t) => Math.min(t / 0.8, 1) * Math.PI);
    expect(count(f, 'halfLoop')).toBe(1);
    expect(count(f, 'loop')).toBe(0);
  });

  it('não conta: sobe-desce repetido (toques para manter o voo)', () => {
    const f = run(20, (t) => Math.sin(t * 6) * 0.5);
    expect(count(f, 'loop')).toBe(0);
    expect(count(f, 'halfLoop')).toBe(0);
  });

  it('não conta: subir até a vertical e voltar', () => {
    const f = run(4, (t) => (t < 1 ? t * 1.6 : Math.max(0, 1.6 - (t - 1) * 1.6)));
    expect(count(f, 'loop')).toBe(0);
    expect(count(f, 'halfLoop')).toBe(0);
  });

  it('não conta loop "ajudado" pelo estol (vale recuperação de estol)', () => {
    const f = run(
      5,
      (t) => Math.min(t / 2.5, 1) * Math.PI * 2,
      { stall: (t) => (t > 0.6 && t < 1.2 ? 1 : 0) },
    );
    expect(count(f, 'loop')).toBe(0);
    expect(count(f, 'stallRecovery')).toBe(1);
  });

  it('voo invertido: tempo de cabeça para baixo é pago ao endireitar', () => {
    const f = run(4, (t) => (t < 0.2 ? 0 : t < 1.8 ? Math.PI : 0));
    expect(count(f, 'inverted')).toBe(1);
  });

  it('não conta invertido rápido (topo normal de um loop)', () => {
    const f = run(3, (t) => Math.min(t / 1.4, 1) * Math.PI * 2);
    expect(count(f, 'inverted')).toBe(0);
  });

  it('rasante: rente ao chão em alta velocidade e sobe sem bater', () => {
    const f = run(3, () => 0, { speed: () => 340, alt: (t) => (t < 1 ? 200 - t * 180 : t < 1.5 ? 20 : 20 + (t - 1.5) * 200) });
    expect(count(f, 'rasante')).toBe(1);
  });

  it('não conta rasante devagar', () => {
    const f = run(3, () => 0, { speed: () => 200, alt: (t) => (t < 1.5 ? 20 : 200) });
    expect(count(f, 'rasante')).toBe(0);
  });
});

describe('pontuação e combo', () => {
  it('distância dá pontos; manobras encadeadas multiplicam', () => {
    const s = new Score(new MemoryStorage());
    s.reset(0);
    s.tick(1, 400);
    expect(s.score).toBe(Math.floor(400 * SCORING.pointsPerUnit));
    const a = s.add('loop', 100, 0, 0);
    expect(a.multiplier).toBe(1);
    s.tick(1, 400);
    const b = s.add('loop', 100, 0, 0);
    expect(b.multiplier).toBe(2);
    expect(b.points).toBe(200);
    expect(b.count).toBe(2);
    s.tick(0.5, 400);
    expect(s.add('ring', 50, 0, 0).points).toBe(150);
    expect(s.maneuverPoints).toBe(450);
  });

  it('tempo demais sem manobra zera o multiplicador', () => {
    const s = new Score(new MemoryStorage());
    s.reset(0);
    s.add('loop', 100, 0, 0);
    s.add('loop', 100, 0, 0);
    expect(s.multiplier).toBe(2);
    expect(s.tick(SCORING.comboWindow + 0.1, 0)).toBe(2);
    expect(s.multiplier).toBe(1);
    expect(s.add('loop', 100, 0, 0).multiplier).toBe(1);
  });

  it('multiplicador tem teto', () => {
    const s = new Score(new MemoryStorage());
    s.reset(0);
    for (let i = 0; i < 20; i++) s.add('graze', 10, 0, 0);
    expect(s.multiplier).toBe(SCORING.comboMax);
  });

  it('recorde persiste por jogo; pontuação congela no fim', () => {
    const storage = new MemoryStorage();
    const s = new Score(storage);
    s.reset(0);
    s.tick(1, 4000);
    const r = s.finish();
    expect(r.score).toBe(100);
    expect(new Score(storage).best).toBe(100);
    expect(storage.getItem('ndc:aviao:best')).toBe('100');
    expect(storage.getItem('ndc:bolinha:best')).toBeNull();
    s.tick(1, 9000);
    expect(s.score).toBe(100);
  });
});
