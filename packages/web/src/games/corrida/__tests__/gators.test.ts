import { describe, expect, it } from 'vitest';
import { SIM } from '../game/config';
import { Engine } from '../game/Engine';
import { GameState } from '../game/types';
import { boteShape, BOTE, Gators, WATER_Y } from '../rendering/gators';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;

/** Partida num trecho plano com um rio de `width` u à frente. */
function withRiver(width: number, lives = 0) {
  const e = new Engine({ storage: new MemoryStorage(), seed: 2, lives, resumeDelay: 0 });
  e.start();
  const l = e.track.level;
  l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = l.vines.length = 0;
  l.fruits.length = l.powerups.length = 0;
  const x = e.runner.x;
  l.ground.length = 0;
  l.addGround(-800, x + 200);
  l.addGround(x + 200 + width, x + 20_000);
  e.track.genX = x + 20_000;
  return { e, gators: new Gators(), riverAt: x + 200 };
}

describe('bote do jacaré', () => {
  it('pulando o rio, o jacaré dá um bote e fecha a boca abaixo das patas (sem encostar)', () => {
    const { e, gators, riverAt } = withRiver(140);
    let snaps = 0;
    let minGap = Infinity;
    let jumped = false;
    for (let i = 0; i < 240 && e.state === GameState.PLAYING; i++) {
      if (!jumped && e.runner.x > riverAt - 70) {
        e.setHolding(true);
        jumped = true;
      }
      e.step(DT);
      gators.update(e, DT);
      for (const s of gators.events.snap) {
        snaps++;
        minGap = Math.min(minGap, s.gap);
      }
    }
    expect(e.state).toBe(GameState.PLAYING);
    expect(snaps).toBe(1);
    expect(minGap).toBeGreaterThan(0);
  });

  it('um bote por rio, mesmo voltando a passar por cima', () => {
    const { e, gators, riverAt } = withRiver(140);
    let emerges = 0;
    for (let i = 0; i < 240; i++) {
      if (e.runner.x > riverAt - 70 && e.runner.grounded) e.setHolding(true);
      e.step(DT);
      gators.update(e, DT);
      emerges += gators.events.emerge.length;
    }
    expect(emerges).toBe(1);
  });

  it('correndo no chão (sem rio por perto) o jacaré fica quieto', () => {
    const { e, gators } = withRiver(140);
    for (let i = 0; i < 20; i++) {
      e.step(DT);
      gators.update(e, DT);
      expect(gators.events.emerge).toHaveLength(0);
    }
  });

  it('caindo no rio, o jacaré pega a capivara', () => {
    const { e, gators } = withRiver(400);
    for (let i = 0; i < 400 && e.state === GameState.PLAYING; i++) {
      e.step(DT);
      gators.update(e, DT);
    }
    expect(e.deathCause).toBe('river');
    let pega = false;
    for (let i = 0; i < 60; i++) {
      gators.update(e, DT);
      if (gators.events.snap.some((s) => s.kind === 'pega')) pega = true;
    }
    expect(pega).toBe(true);
  });

  it('forma do bote: sobe de boca aberta, fecha no alto e volta para a água', () => {
    const g = { key: 0, x: 0, t: 0, reach: 60, kind: 'bote' as const, snapped: false };
    const at = (t: number) => boteShape({ ...g, t });
    expect(at(0).rise).toBe(0);
    expect(at(BOTE.duration * BOTE.snapAt * 0.6).open).toBeGreaterThan(0.6);
    expect(at(BOTE.duration * BOTE.snapAt).rise).toBeCloseTo(1, 2);
    expect(at(BOTE.duration * BOTE.snapAt + 0.01).open).toBeLessThan(0.1);
    expect(at(BOTE.duration).rise).toBeLessThan(0.01);
    expect(WATER_Y).toBeLessThan(0);
  });
});
