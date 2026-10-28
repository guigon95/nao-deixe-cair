import { SIM } from '../config';
import { createScheme, SCHEME_B, type ControlSchemeId } from '../Controls';
import { createPlane, stepPlane } from '../Plane';
import { createRng, type Rng } from '../../../../shared/random';

/**
 * Comparação objetiva dos esquemas de controle, com jogadores simulados.
 * Os perfis de toque (durações, intervalos, velocidade de deslize) são
 * suposições de jogador casual, não medições com pessoas.
 */

type Event = { t: number; kind: 'press' | 'release' | 'swipe'; dy?: number };

function simulate(id: ControlSchemeId, events: Event[], seconds: number, speed = 240) {
  const scheme = createScheme(id);
  const plane = createPlane(0, 400, speed);
  const dt = SIM.fixedDt;
  let ei = 0;
  let firstTurnAt = -1;
  let maxRotation = 0;
  let stallTime = 0;
  const startPhi = plane.phi;
  let minPhi = plane.phi;
  const startY = plane.y;
  let maxClimb = 0;
  const alt: number[] = [];
  for (let i = 0; i * dt < seconds; i++) {
    const t = i * dt;
    while (ei < events.length && events[ei].t <= t) {
      const e = events[ei++];
      if (e.kind === 'press') scheme.press(t);
      else if (e.kind === 'release') scheme.release(t);
      else scheme.swipe(t, e.dy ?? 0);
    }
    stepPlane(plane, scheme.command(t, plane), dt);
    if (firstTurnAt < 0 && plane.phi - startPhi > (5 * Math.PI) / 180) firstTurnAt = t;
    // Rotação líquida para cima, a partir do menor ângulo até aqui (como o detector de manobras).
    minPhi = Math.min(minPhi, plane.phi);
    maxRotation = Math.max(maxRotation, plane.phi - minPhi);
    if (plane.stall > 0.6) stallTime += dt;
    maxClimb = Math.max(maxClimb, plane.y - startY);
    alt.push(plane.y);
  }
  return { scheme, plane, firstTurnAt, maxRotation, stallTime, alt, maxClimb };
}

/** Jogador "mantendo o voo": toques curtos e irregulares, como quem bate na tela para não cair. */
function tapper(rng: Rng, seconds: number): Event[] {
  const ev: Event[] = [];
  let t = 0.2;
  while (t < seconds) {
    const dur = 0.07 + rng() * 0.15; // 70–220 ms
    ev.push({ t, kind: 'press' }, { t: t + dur, kind: 'release' });
    t += dur + 0.1 + rng() * 0.35; // intervalo 100–450 ms
  }
  return ev;
}

export interface ControlReport {
  scheme: ControlSchemeId;
  /** Tempo do toque até o nariz girar 5° (ms). */
  responseMs: number;
  /** Fração de tentativas de loop bem-sucedidas (jogador casual). */
  loopSuccess: number;
  /** Manobras de gesto disparadas sem querer em 60 s de toques para manter o voo. */
  accidentalPerMinute: number;
  /** Loops completos sem querer nos mesmos 60 s. */
  accidentalLoopsPerMinute: number;
  /** Segurar 3 s: quanto sobe (u) e se virou loop sem querer. */
  hold3Climb: number;
  hold3Loop: boolean;
}

export function compareControls(trials = 40): ControlReport[] {
  const out: ControlReport[] = [];
  for (const id of ['a', 'b', 'c'] as const) {
    // 1) Resposta ao toque: aperta e segura a partir do voo nivelado.
    const r = simulate(id, [{ t: 0, kind: 'press' }], 1);
    const responseMs = Math.round(r.firstTurnAt * 1000);

    // 2) Loop de propósito. A: segura por 1,3–3,0 s ("segure até dar a volta").
    //    B: segura e desliza para cima com velocidade de 500–2000 u/s de tela.
    //    C: toque (60–180 ms), intervalo de 80–260 ms, toque segurado por 0,4–0,8 s.
    const rng = createRng(1234);
    let ok = 0;
    for (let i = 0; i < trials; i++) {
      const t1 = 0.06 + rng() * 0.12;
      const gap = 0.08 + rng() * 0.18;
      const hold = 0.4 + rng() * 0.4;
      const ev: Event[] =
        id === 'c'
          ? [
              { t: 0.1, kind: 'press' },
              { t: 0.1 + t1, kind: 'release' },
              { t: 0.1 + t1 + gap, kind: 'press' },
              { t: 0.1 + t1 + gap + hold, kind: 'release' },
            ]
          : id === 'a'
          ? [
              { t: 0.1, kind: 'press' },
              { t: 0.1 + 1.3 + rng() * 1.7, kind: 'release' },
            ]
          : [
              { t: 0.1, kind: 'press' },
              { t: 0.18, kind: 'swipe', dy: -(500 + rng() * 1500) },
              { t: 0.35, kind: 'release' },
            ];
      if (simulate(id, ev, 5).maxRotation >= Math.PI * 2) ok++;
    }

    // 3) Manobras acidentais: 60 s de toques irregulares para manter o voo.
    let gestures = 0;
    let loops = 0;
    const runs = 10;
    for (let k = 0; k < runs; k++) {
      const s = simulate(id, tapper(createRng(77 + k), 60), 60);
      gestures += s.scheme.gestures;
      loops += Math.floor(s.maxRotation / (Math.PI * 2));
    }
    // 4) Segurar 3 s a partir do voo nivelado.
    const h = simulate(id, [{ t: 0, kind: 'press' }, { t: 3, kind: 'release' }], 3);
    out.push({
      scheme: id,
      hold3Climb: Math.round(h.maxClimb),
      hold3Loop: h.maxRotation >= Math.PI * 2,
      responseMs,
      loopSuccess: ok / trials,
      accidentalPerMinute: gestures / runs,
      accidentalLoopsPerMinute: loops / runs,
    });
  }
  return out;
}

export const COMPARISON_ASSUMPTIONS = {
  tapDurationMs: [70, 220],
  tapGapMs: [100, 450],
  loopHoldSeconds: [1.3, 3.0],
  swipeSpeed: [500, 2000],
  swipeThreshold: SCHEME_B.swipeSpeed,
} as const;
