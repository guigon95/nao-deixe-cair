import { describe, expect, it } from 'vitest';
import { BALL_X, PHYSICS } from '../game/config';
import { ballHitsBarrier, circleIntersectsRect, substepsFor } from '../game/Collision';
import { GameEngine } from '../game/GameEngine';
import { MemoryStorage } from '../game/ScoreManager';
import { GameState, type Barrier } from '../game/types';

const barrier = (x: number, gapTop: number, gapBottom: number, width = 54): Barrier => ({
  id: 1,
  x,
  prevX: x,
  width,
  gapTop,
  gapBottom,
  passed: false,
  passGlow: 0,
});

describe('Colisão círculo × retângulo', () => {
  it('detecta interseção e ausência de interseção', () => {
    expect(circleIntersectsRect(0, 0, 5, 3, -1, 10, 2)).toBe(true);
    expect(circleIntersectsRect(0, 0, 5, 6, -1, 10, 2)).toBe(false);
  });

  it('considera o raio, não só o centro', () => {
    // Centro fora do retângulo, mas a borda da bolinha encosta.
    expect(circleIntersectsRect(100, 95, 10, 90, 100, 20, 20)).toBe(true);
    // Canto: distância diagonal maior que o raio → sem colisão.
    expect(circleIntersectsRect(82, 92, 10, 90, 100, 20, 20)).toBe(false);
  });

  it('passagem segura pelo centro do vão não gera colisão falsa', () => {
    const b = barrier(BALL_X - 27, 250, 400);
    expect(ballHitsBarrier(BALL_X, 325, PHYSICS.ballRadius, b)).toBe(false);
  });

  it('bater na parte superior ou inferior gera colisão', () => {
    const b = barrier(BALL_X - 27, 250, 400);
    expect(ballHitsBarrier(BALL_X, 255, PHYSICS.ballRadius, b)).toBe(true);
    expect(ballHitsBarrier(BALL_X, 395, PHYSICS.ballRadius, b)).toBe(true);
    expect(ballHitsBarrier(BALL_X, 100, PHYSICS.ballRadius, b)).toBe(true);
  });

  it('a borda frontal da bolinha colide antes do centro chegar à barreira', () => {
    const r = PHYSICS.ballRadius;
    const b = barrier(BALL_X + r - 1, 300, 450); // barreira a 11 u do centro
    expect(ballHitsBarrier(BALL_X, 200, r, b)).toBe(true);
  });
});

describe('Prevenção de tunelamento', () => {
  it('subpassos limitam o deslocamento a meio raio', () => {
    expect(substepsFor(1, 12)).toBe(1);
    expect(substepsFor(25, 12)).toBe(5);
    const n = substepsFor(100, 10);
    expect(100 / n).toBeLessThanOrEqual(5);
  });

  it('sem subpassos uma barreira fina e rápida “atravessa”; com subpassos é detectada', () => {
    const r = 10;
    const speed = 3000;
    const stepDt = 1 / 120; // 25 u por passo
    const run = (useSub: boolean) => {
      const b = barrier(136, 0, 1, 4); // parede fina; amostras em 111 e 86 “pulam” a bolinha
      const n = useSub ? substepsFor(speed * stepDt, r) : 1;
      for (let s = 0; s < 3; s++) {
        for (let i = 0; i < n; i++) {
          b.x -= (speed * stepDt) / n;
          if (ballHitsBarrier(100, 300, r, b)) return true;
        }
      }
      return false;
    };
    expect(run(false)).toBe(false);
    expect(run(true)).toBe(true);
  });

  it('o motor nunca move nada mais que meio raio de colisão por subpasso', () => {
    // Em alta velocidade (fim da curva) o deslocamento combinado por passo é verificado.
    const r = PHYSICS.ballRadius * PHYSICS.hitboxScale;
    const worst = (285 + 480) * PHYSICS.fixedDt;
    expect(worst / substepsFor(worst, r)).toBeLessThanOrEqual(r / 2 + 1e-9);
  });
});

describe('Colisão no motor', () => {
  it('colisão válida encerra a partida e congela a pontuação', () => {
    const e = new GameEngine({ storage: new MemoryStorage(), seed: 3 });
    e.start();
    const b = e.obstacles.barriers[0];
    b.x = BALL_X + 2; // coloca a barreira em cima da bolinha
    b.gapTop = e.ball.y + 40; // bolinha bate na parte superior
    b.gapBottom = b.gapTop + 150;
    const crashes: number[] = [];
    e.on((ev) => ev.type === 'crash' && crashes.push(ev.score));
    e.advance(PHYSICS.fixedDt);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(crashes).toHaveLength(1);
    const frozen = e.score.score;
    e.advance(0.1);
    e.advance(0.1);
    expect(e.score.score).toBe(frozen);
    expect(e.score.addBarrier()).toBe(false);
    expect(e.score.score).toBe(frozen);
  });
});
