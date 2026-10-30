import type { ItemKind } from './config';

export const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export type Dir = 'up' | 'down' | 'left' | 'right';

export const DELTA: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export interface Cell {
  x: number;
  y: number;
}

export interface Item extends Cell {
  id: number;
  kind: ItemKind;
  /** Tempo desde que apareceu (s) — animação de entrada e sumiço dos raros. */
  age: number;
  /** Tempo de vida (s); 0 = fica até ser comido. */
  life: number;
}

export type CrashReason = 'wall' | 'self';

export type EngineEvent =
  | { type: 'state'; state: GameState; previous: GameState }
  | { type: 'eat'; item: Item; points: number; multiplier: number; length: number }
  | { type: 'spawn'; item: Item }
  | { type: 'expire'; item: Item }
  | { type: 'turn'; dir: Dir }
  | { type: 'milestone'; length: number }
  | { type: 'multiplier'; on: boolean }
  | { type: 'newRecord'; score: number }
  | { type: 'crash'; reason: CrashReason; x: number; y: number; score: number; best: number; isNewRecord: boolean; length: number };
