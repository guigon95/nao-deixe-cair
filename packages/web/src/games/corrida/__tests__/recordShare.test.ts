import { describe, expect, it } from 'vitest';
import { RECORD_SIGN_MIN, SCORING, SIM, STORAGE } from '../game/config';
import { Engine } from '../game/Engine';
import { GameState, type GameEvent } from '../game/types';
import { shareText } from '../app/share';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;

function flat(storage = new MemoryStorage()) {
  const e = new Engine({ storage, seed: 4, lives: 0, resumeDelay: 0 });
  const events: GameEvent[] = [];
  e.on((ev) => events.push(ev));
  e.start();
  const l = e.track.level;
  l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = l.vines.length = 0;
  l.fruits.length = l.powerups.length = l.logs.length = l.pups.length = 0;
  l.ground.length = 0;
  l.addGround(-800, 400_000);
  e.track.genX = 400_000;
  return { e, l, events, storage };
}

describe('placa do recorde e compartilhar', () => {
  it('guarda a maior distância e, na partida seguinte, avisa ao passar da placa', () => {
    const storage = new MemoryStorage();
    const a = flat(storage);
    // Corre uns 80 m e bate.
    for (let i = 0; i < 120 * 30 && a.e.score.meters < 80; i++) a.e.step(DT);
    a.l.rocks.push({ x0: a.e.runner.x + 30, x1: a.e.runner.x + 64, top: 30, variant: 0, broken: false });
    for (let i = 0; i < 120 && a.e.state === GameState.PLAYING; i++) a.e.step(DT);
    const best = a.e.score.meters;
    expect(Number(storage.getItem(STORAGE.bestMeters))).toBe(best);
    expect(best).toBeGreaterThanOrEqual(RECORD_SIGN_MIN);

    const b = flat(storage);
    expect(b.e.score.bestMetersAtStart).toBe(best);
    for (let i = 0; i < 120 * 30 && b.e.runner.x < (best + 3) * SCORING.unitsPerMeter; i++) b.e.step(DT);
    expect(b.events.filter((ev) => ev.type === 'recordSign')).toHaveLength(1);
    expect(b.e.passedSign).toBe(true);
  });

  it('sem distância suficiente antes, não há placa nem aviso', () => {
    const { e, events } = flat();
    for (let i = 0; i < 120 * 3; i++) e.step(DT);
    expect(events.some((ev) => ev.type === 'recordSign')).toBe(false);
  });

  it('texto de compartilhar traz pontos, metros e a posição da semana', () => {
    expect(shareText({ score: 1234, meters: 456, fruits: 30, isNewRecord: false, weekPosition: 3 })).toMatch(/1234 pontos.*456 m.*3º na semana/);
    expect(shareText({ score: 50, meters: 20, fruits: 1, isNewRecord: false })).not.toMatch(/semana/);
  });
});
