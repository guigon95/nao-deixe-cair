import { describe, expect, it } from 'vitest';
import { PUPS, SIM } from '../game/config';
import { Engine } from '../game/Engine';
import { MISSION_DEFS, targetFor } from '../game/Missions';
import { Track } from '../game/Track';
import { GameState, type GameEvent } from '../game/types';
import { createRng } from '../../../shared/random';
import { MemoryStorage } from '../../../shared/storage/storage';

const DT = SIM.fixedDt;

function flat() {
  const e = new Engine({ storage: new MemoryStorage(), seed: 4, lives: 0, resumeDelay: 0 });
  const events: GameEvent[] = [];
  e.on((ev) => events.push(ev));
  e.start();
  const l = e.track.level;
  l.rocks.length = l.thorns.length = l.crates.length = l.springs.length = l.platforms.length = l.vines.length = 0;
  l.fruits.length = l.powerups.length = l.logs.length = l.pups.length = 0;
  l.ground.length = 0;
  l.addGround(-800, 40_000);
  e.track.genX = 40_000;
  return { e, l, events };
}

const run = (e: Engine, s: number) => {
  for (let i = 0; i < s / DT && e.state === GameState.PLAYING; i++) e.step(DT);
};

describe('filhotes em fila', () => {
  it('passando por um filhote, ele entra na fila e os pontos ganham +25% por filhote', () => {
    const { e, l, events } = flat();
    for (let i = 0; i < 3; i++) l.pups.push({ x: e.runner.x + 60 + i * 80, taken: false });
    run(e, 1.2);
    expect(e.pups).toBe(3);
    expect(events.filter((ev) => ev.type === 'pup' && ev.phase === 'join')).toHaveLength(3);
    expect(e.score.mult).toBeCloseTo(1 + 3 * PUPS.bonus);
  });

  it('no máximo 5 na fila', () => {
    const { e, l } = flat();
    for (let i = 0; i < 8; i++) l.pups.push({ x: e.runner.x + 40 + i * 40, taken: false });
    run(e, 1.5);
    expect(e.pups).toBe(PUPS.max);
  });

  it('o bônus se combina com o capim dourado', () => {
    const { e, l } = flat();
    l.pups.push({ x: e.runner.x + 40, taken: false });
    l.powerups.push({ x: e.runner.x + 120, y: 17, kind: 'golden', taken: false });
    run(e, 0.8);
    expect(e.score.mult).toBeCloseTo(2 * (1 + PUPS.bonus));
  });

  it('atravessar um caixote espalha os filhotes', () => {
    const { e, l, events } = flat();
    e.pups = 3;
    l.crates.push({ x0: e.runner.x + 40, x1: e.runner.x + 76, top: 36, broken: false, brokenAt: 0 });
    run(e, 0.6);
    expect(e.pups).toBe(0);
    expect(events.some((ev) => ev.type === 'pup' && ev.phase === 'lost' && ev.count === 3)).toBe(true);
    expect(e.score.mult).toBe(1);
  });

  it('o escudo salva a capivara, mas os filhotes se espalham', () => {
    const { e, l } = flat();
    e.pups = 2;
    e.shield = true;
    l.rocks.push({ x0: e.runner.x + 60, x1: e.runner.x + 94, top: 30, variant: 0, broken: false });
    run(e, 0.8);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.pups).toBe(0);
  });

  it('pulando por cima, o filhote não é pego (só no chão)', () => {
    const { e, l } = flat();
    l.pups.push({ x: e.runner.x + 150, taken: false });
    e.runner.grounded = false;
    e.runner.y = 120;
    e.runner.vy = 600;
    run(e, 0.4);
    expect(e.pups).toBe(0);
  });

  it('o gerador coloca filhotes de vez em quando, no chão, depois de 15 s', () => {
    let seen = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const t = new Track(createRng(seed));
      for (let x = 0; x < 120_000; x += 400) {
        const before = new Set(t.level.pups);
        const time = x / 380;
        t.update(x, time, 380);
        for (const p of t.level.pups) if (!before.has(p)) {
          seen++;
          expect(time).toBeGreaterThan(PUPS.firstAfter - 5);
        }
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('a missão de filhotes nunca pede mais que 5', () => {
    const def = MISSION_DEFS.find((d) => d.kind === 'pups')!;
    for (let lv = 1; lv < 40; lv++) expect(targetFor(def, lv)).toBeLessThanOrEqual(PUPS.max);
  });
});
