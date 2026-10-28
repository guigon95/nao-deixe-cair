export const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

export type ObstacleKind = 'balloon' | 'bird' | 'tower';

export interface Obstacle {
  active: boolean;
  id: number;
  kind: ObstacleKind;
  /** Centro (balão, pássaro) ou centro da base (torre), mundo, y para cima. */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Raio de colisão (balão, pássaro) ou meia largura (torre). */
  r: number;
  /** Torre: altura do topo (y absoluto). Pássaro: x de origem da patrulha. */
  top: number;
  /** Pássaro: frequência da patrulha (rad/s). Positivo = olhando para a esquerda. */
  vx: number;
  phase: number;
  baseY: number;
  /** Já rendeu um "raspão". */
  grazed: boolean;
  /** Cor/variante visual. */
  variant: number;
}

export interface Ring {
  active: boolean;
  id: number;
  x: number;
  y: number;
  /** Raio da abertura. */
  r: number;
  passed: boolean;
  /** Anel alto, que recompensa um loop. */
  high: boolean;
  /** Tempo desde a passagem (efeito). */
  glow: number;
}

/**
 * Trecho do mundo. O corredor livre garantido tem centro `center` no meio
 * do trecho e é interpolado linearmente até o meio dos vizinhos.
 */
export interface Segment {
  x0: number;
  x1: number;
  center: number;
  gap: number;
}

/** Faixa livre em um x (y absoluto). */
export interface Band {
  bottom: number;
  top: number;
}

export type ManeuverKind = 'loop' | 'halfLoop' | 'rasante' | 'inverted' | 'stallRecovery' | 'graze' | 'ring' | 'roll';

export interface ManeuverEvent {
  kind: ManeuverKind;
  /** Pontos já multiplicados. */
  points: number;
  base: number;
  multiplier: number;
  /** Quantos iguais seguidos (ex.: LOOP ×2 em sequência). */
  count: number;
  x: number;
  y: number;
}

export type GameEvent =
  | { type: 'state'; state: GameState; previous: GameState }
  | { type: 'maneuver'; m: ManeuverEvent }
  | { type: 'comboLost'; multiplier: number }
  | { type: 'stall'; on: boolean }
  | { type: 'skid'; on: boolean; x: number; y: number }
  | { type: 'crash'; x: number; y: number; score: number; best: number; isNewRecord: boolean; cause: 'ground' | ObstacleKind }
  | { type: 'newRecord'; score: number };
