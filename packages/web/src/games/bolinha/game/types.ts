export const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  /** Bateu, mas ainda há vidas: o jogador escolhe continuar de onde parou ou encerrar. */
  CONTINUE: 'CONTINUE',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export interface Ball {
  x: number;
  y: number;
  vy: number;
  radius: number;
  /** Y no passo anterior — para interpolação na renderização. */
  prevY: number;
}

export interface Barrier {
  id: number;
  /** Borda esquerda. */
  x: number;
  /** X no passo anterior — para interpolação na renderização. */
  prevX: number;
  width: number;
  /** Y do topo do vão (fim da parte superior). */
  gapTop: number;
  /** Y da base do vão (início da parte inferior). */
  gapBottom: number;
  passed: boolean;
  /** Tempo (s) desde a passagem — usado só para efeito visual. */
  passGlow: number;
}

export interface DifficultyParams {
  /** Velocidade horizontal das barreiras (u/s). */
  speed: number;
  /** Distância horizontal entre bordas esquerdas de barreiras consecutivas (u). */
  spacing: number;
  /** Altura do vão (u). */
  gap: number;
  /** Maior deslocamento vertical entre centros de vãos consecutivos que o padrão pode pedir (u). */
  maxShift: number;
  /** 0..1 — progresso da curva de dificuldade, usado para escolher padrões. */
  level: number;
}

export type { Storage } from '../../../shared/storage/storage';

export type GameEvent =
  | { type: 'state'; state: GameState; previous: GameState }
  | { type: 'pass'; barrier: Barrier; score: number }
  | { type: 'crash'; x: number; y: number; score: number; best: number; isNewRecord: boolean; livesLeft: number }
  | { type: 'continue'; livesLeft: number }
  | { type: 'newRecord'; score: number };
