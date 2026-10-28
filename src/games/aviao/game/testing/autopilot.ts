import type { Engine } from '../Engine';
import { GameState } from '../types';

/**
 * Piloto automático simples (esquema A: só segura/solta) que segue o meio
 * do corredor livre olhando um pouco à frente. Não lê obstáculos: se ele
 * sobrevive, o corredor garantido pelo gerador é de fato voável.
 */
export class Autopilot {
  /** Quantas vezes segurou (para ver que não é trivial). */
  presses = 0;

  decide(engine: Engine): boolean {
    const p = engine.plane;
    const look = 120 + p.speed * 0.5;
    let bottom = -Infinity;
    let top = Infinity;
    for (let k = 0; k <= 6; k++) {
      const c = engine.world.corridorAt(p.x + (look * k) / 6);
      if (!c) continue;
      bottom = Math.max(bottom, c.bottom);
      top = Math.min(top, c.top);
    }
    const target = bottom < top ? (bottom + top) / 2 : (bottom + top) / 2;
    const desired = Math.max(-0.55, Math.min(0.55, ((target - p.y) / look) * 1.6));
    let phi = p.phi % (Math.PI * 2);
    if (phi > Math.PI) phi -= Math.PI * 2;
    if (phi < -Math.PI) phi += Math.PI * 2;
    return phi < desired;
  }
}

/** Joga `seconds` de partida com o piloto. Retorna o tempo sobrevivido. */
export function autoplay(engine: Engine, seconds: number, dt = 1 / 120): { survived: number; crashed: boolean } {
  const pilot = new Autopilot();
  if (engine.state !== GameState.PLAYING) engine.start();
  let t = 0;
  while (t < seconds && engine.state === GameState.PLAYING) {
    const h = pilot.decide(engine);
    if (h && !engine.holding) pilot.presses++;
    engine.setHolding(h);
    engine.step(dt);
    t += dt;
  }
  return { survived: t, crashed: engine.state === GameState.GAME_OVER };
}
