import { describe, expect, it } from 'vitest';
import { SIM } from '../game/config';
import { Engine } from '../game/Engine';
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
  l.addGround(-800, 20_000);
  e.track.genX = 20_000;
  return { e, l, events };
}

const run = (e: Engine, s: number) => {
  for (let i = 0; i < s / DT && e.state === GameState.PLAYING; i++) e.step(DT);
};

describe('escudo de vitória-régia', () => {
  it('pegar o escudo liga a proteção', () => {
    const { e, l, events } = flat();
    l.powerups.push({ x: e.runner.x + 50, y: 17, kind: 'shield', taken: false });
    run(e, 0.5);
    expect(e.shield).toBe(true);
    expect(events.some((ev) => ev.type === 'shield' && ev.on)).toBe(true);
  });

  it('aguenta uma batida na pedra (quebra a pedra) e se gasta', () => {
    const { e, l, events } = flat();
    e.shield = true;
    const x = e.runner.x;
    l.rocks.push({ x0: x + 60, x1: x + 94, top: 30, variant: 0, broken: false });
    run(e, 1);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.shield).toBe(false);
    expect(l.rocks[0].broken).toBe(true);
    expect(events.some((ev) => ev.type === 'shield' && !ev.on && ev.saved === 'rock')).toBe(true);
    // Segunda batida, sem escudo: acaba.
    const x2 = e.runner.x;
    l.rocks.push({ x0: x2 + 120, x1: x2 + 154, top: 30, variant: 0, broken: false });
    run(e, 1.5);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.deathCause).toBe('rock');
  });

  it('aguenta espinhos', () => {
    const { e, l } = flat();
    e.shield = true;
    const x = e.runner.x;
    l.thorns.push({ x0: x + 60, x1: x + 200, top: 24, broken: false });
    run(e, 1.2);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.shield).toBe(false);
  });

  it('no rio, vira folhas de vitória-régia até a outra margem', () => {
    const { e, l } = flat();
    e.shield = true;
    const x = e.runner.x;
    l.ground.length = 0;
    l.addGround(-800, x + 50);
    l.addGround(x + 700, x + 20_000); // rio largo demais para pular
    run(e, 3);
    expect(e.state).toBe(GameState.PLAYING);
    expect(e.runner.x).toBeGreaterThan(x + 700);
    expect(l.platforms.some((p) => p.kind === 'vitoria')).toBe(true);
  });

  it('não salva dos marimbondos', () => {
    const { e } = flat();
    e.shield = true;
    e.swarm = 1;
    e.runner.slow = 0.1;
    run(e, 1);
    expect(e.state).toBe(GameState.GAME_OVER);
    expect(e.deathCause).toBe('swarm');
  });

  it('nova partida começa sem escudo; sorteio de tipo cobre todos os itens', () => {
    const { e } = flat();
    e.shield = true;
    e.pause();
    e.start();
    expect(e.shield).toBe(false);
    const kinds = new Set<string>();
    for (let i = 0; i < 100; i++) kinds.add(pickKind(i / 100));
    expect([...kinds].sort()).toEqual(['acai', 'golden', 'magnet', 'shield']);
  });
});
