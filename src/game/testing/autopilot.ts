import { PHYSICS } from '../config';
import { ballHitsBarrier } from '../Collision';
import { difficultyAt } from '../Difficulty';
import type { GameEngine } from '../GameEngine';
import { stepBall } from '../Physics';
import type { Ball, Barrier } from '../types';

/**
 * Piloto automático usado nos testes de justiça do gerador.
 * Faz busca em árvore (segurar/soltar a cada `decision` s) sobre a física
 * real do jogo, prevendo o movimento das barreiras. Se ele sobrevive por
 * minutos em muitas sementes, o gerador não está criando sequências
 * impossíveis. Não modela tempo de reação humano — o validador do gerador
 * já reserva essa margem.
 */
export class Autopilot {
  constructor(
    private depth = 8,
    private decision = 0.06,
  ) {}

  decide(engine: GameEngine): boolean {
    const speed = difficultyAt(engine.elapsed).speed;
    const barriers = engine.obstacles.barriers.filter((b) => b.x + b.width > engine.ball.x - engine.ball.radius - 2);
    const target = this.targetY(engine.ball, barriers);
    let best = Infinity;
    let bestAction = false;
    for (const action of [true, false]) {
      const cost = this.search({ ...engine.ball }, action, 0, 0, barriers, speed, target);
      if (cost < best) {
        best = cost;
        bestAction = action;
      }
    }
    return bestAction;
  }

  private targetY(ball: Ball, barriers: Barrier[]): number {
    const next = barriers.find((b) => b.x + b.width > ball.x - ball.radius);
    return next ? (next.gapTop + next.gapBottom) / 2 : ball.y;
  }

  private search(ball: Ball, hold: boolean, d: number, t0: number, barriers: Barrier[], speed: number, target: number): number {
    const steps = Math.round(this.decision / PHYSICS.fixedDt);
    let t = t0;
    const r = ball.radius * PHYSICS.hitboxScale;
    for (let i = 0; i < steps; i++) {
      stepBall(ball, hold, PHYSICS.fixedDt);
      t += PHYSICS.fixedDt;
      for (const b of barriers) {
        const shifted = { ...b, x: b.x - speed * t };
        if (ballHitsBarrier(ball.x, ball.y, r + 0.5, shifted)) return 1e9 - d * 1e6;
      }
    }
    if (d + 1 >= this.depth) {
      // Alvo: centro do próximo vão que a bolinha ainda vai cruzar no instante t.
      const next = barriers.find((b) => b.x - speed * t + b.width > ball.x - ball.radius);
      if (!next) return Math.abs(ball.y - target) * 0.1;
      const c = (next.gapTop + next.gapBottom) / 2;
      const band = (next.gapBottom - next.gapTop) / 2 - ball.radius - 10;
      const off = Math.max(0, Math.abs(ball.y - c) - band);
      return off * 4 + Math.abs(ball.y - c) * 0.1 + Math.abs(ball.vy) * 0.03;
    }
    let best = Infinity;
    for (const action of [hold, !hold]) {
      const c = this.search({ ...ball }, action, d + 1, t, barriers, speed, target);
      if (c < best) best = c;
      if (best < 1) break;
    }
    return best;
  }
}

/** Joga uma partida automática por até `maxSeconds`. Retorna o tempo sobrevivido. */
export function autoplay(engine: GameEngine, maxSeconds: number, pilot = new Autopilot()): number {
  engine.start();
  const stepsPerDecision = Math.round(0.06 / PHYSICS.fixedDt);
  let n = 0;
  while (engine.state === 'PLAYING' && engine.elapsed < maxSeconds) {
    if (n % stepsPerDecision === 0) engine.setHolding(pilot.decide(engine));
    engine.advance(PHYSICS.fixedDt);
    n++;
  }
  return engine.elapsed;
}
