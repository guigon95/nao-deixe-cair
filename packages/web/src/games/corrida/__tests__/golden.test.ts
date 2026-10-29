import { describe, expect, it } from 'vitest';
import { GOLDEN, SCORING, SIM } from '../game/config';
import { Engine } from '../game/Engine';
import { Score } from '../game/Score';
import { pickKind } from '../game/Track';
import { GameState, type GameEvent } from '../game/types';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;

function flat() {
  const e = new Engine({ storage: new MemoryStorage(), seed: 4, lives: 0, resumeDelay: 0 });
  const events: GameEvent[] = [];
  e.on((ev) => events.push(ev));
  e.start();
  const l = e.track.level;
  l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = l.vines.length = 0;
  l.fruits.length = l.powerups.length = 0;
  l.ground.length = 0;
  l.addGround(-800, 40_000);
  e.track.genX = 40_000;
  return { e, l, events };
}

const run = (e: Engine, s: number) => {
  for (let i = 0; i < s / DT && e.state === GameState.PLAYING; i++) e.step(DT);
};

describe('capim dourado', () => {
  it('pontuação: com ×2, metros, capins e bônus contam em dobro', () => {
    const s = new Score(new MemoryStorage());
    s.reset(0);
    s.tick(100); // 10 m normais
    s.mult = 2;
    s.tick(300); // +20 m em dobro
    s.addFruit();
    s.addBonus(SCORING.smash);
    s.mult = 1;
    s.tick(400); // +10 m normais
    expect(s.meters).toBe(40);
    expect(s.score).toBe(40 + 20 + SCORING.fruit * 2 + SCORING.smash * 2);
  });

  it('pegar liga o ×2 por 10 s, o tempo acaba e volta ao normal', () => {
    const { e, l, events } = flat();
    l.powerups.push({ x: e.runner.x + 50, y: 17, kind: 'golden', taken: false });
    run(e, 0.5);
    expect(e.golden).toBeGreaterThan(GOLDEN.duration - 0.5);
    expect(e.score.mult).toBe(GOLDEN.mult);
    expect(events.some((ev) => ev.type === 'golden' && ev.on)).toBe(true);
    run(e, GOLDEN.duration);
    expect(e.golden).toBe(0);
    expect(e.score.mult).toBe(1);
    expect(events.some((ev) => ev.type === 'golden' && !ev.on)).toBe(true);
  });

  it('a mesma corrida com capim dourado faz mais pontos (metros iguais)', () => {
    const a = flat();
    const b = flat();
    b.l.powerups.push({ x: b.e.runner.x + 30, y: 17, kind: 'golden', taken: false });
    run(a.e, 6);
    run(b.e, 6);
    expect(b.e.score.meters).toBe(a.e.score.meters);
    expect(b.e.score.score).toBeGreaterThan(a.e.score.score * 1.8);
  });

  it('nova partida zera o ×2', () => {
    const { e } = flat();
    e.golden = 5;
    e.score.mult = 2;
    e.pause();
    e.start();
    expect(e.golden).toBe(0);
    expect(e.score.mult).toBe(1);
    expect(e.score.score).toBe(0);
  });

  it('o sorteio dos itens inclui o capim dourado', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 100; i++) kinds.add(pickKind(i / 100));
    expect(kinds.has('golden')).toBe(true);
  });
});
