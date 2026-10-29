export const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  GAME_OVER: 'GAME_OVER',
} as const;
export type GameState = (typeof GameState)[keyof typeof GameState];

/** Trecho de chão (y = 0). Entre dois trechos há um buraco (rio). */
export interface GroundSpan {
  x0: number;
  x1: number;
}

/**
 * Obstáculo sólido: dá para pousar em cima; bater de lado encerra a partida
 * (a não ser no dash, que quebra a pedra).
 */
export interface Rock {
  x0: number;
  x1: number;
  top: number;
  /** Variante visual. */
  variant: number;
  broken: boolean;
}

/** Galho/tronco suspenso: só segura quem vem de cima ("uma via"). */
export interface Platform {
  x0: number;
  x1: number;
  y: number;
}

/** Caixote: atravessar atrasa (o enxame chega perto); cair em cima quica. */
export interface Crate {
  x0: number;
  x1: number;
  top: number;
  broken: boolean;
  /** Tempo desde a quebra (efeito). */
  brokenAt: number;
}

/** Moita de espinhos: encostar encerra a partida (menos no dash). */
export interface Thorns {
  x0: number;
  x1: number;
  top: number;
  broken: boolean;
}

/** Flor-mola: pousar em cima lança bem alto. */
export interface Spring {
  x0: number;
  x1: number;
  top: number;
  /** Tempo de partida do último uso (animação). */
  usedAt: number;
}

export interface Fruit {
  x: number;
  y: number;
  taken: boolean;
  /** Fora do caminho seguro (vale o mesmo, mas o desenho brilha um pouco mais). */
  risky: boolean;
}

/** Estado físico do quati. Objeto simples: dá para clonar (piloto automático). */
export interface Runner {
  x: number;
  /** Pés (y para cima). */
  y: number;
  prevX: number;
  prevY: number;
  vy: number;
  grounded: boolean;
  /** Tempo desde que saiu do chão (coyote). */
  airTime: number;
  /** Já usou o pulo desde o último pouso. */
  jumped: boolean;
  /** O pulo atual já foi cortado (soltou subindo). */
  cut: boolean;
  /** Tempo planado neste pulo. */
  glideTime: number;
  gliding: boolean;
  fastFall: boolean;
  /** Tempo restante atravessando uma plataforma para baixo. */
  dropThrough: number;
  /** Pulo "guardado" (toque pouco antes de pousar). */
  buffer: number;
  dash: number;
  /** Depois do dash, um instante em que ainda quebra pedras (s). */
  dashTail: number;
  /** Multiplicador de velocidade (caixote atrasa). */
  slow: number;
  /** Tempo desde o último pouso (animação de "squash"). */
  landedAt: number;
  /** Pousou em cima de algo nesta etapa (para efeitos). */
  justLanded: boolean;
}

export type DeathCause = 'rock' | 'thorns' | 'river' | 'swarm';

export type GameEvent =
  | { type: 'state'; state: GameState; previous: GameState }
  | { type: 'jump'; x: number; y: number }
  | { type: 'land'; x: number; y: number; hard: boolean }
  | { type: 'glide'; on: boolean }
  | { type: 'fruit'; x: number; y: number; streak: number; meterFull: boolean }
  | { type: 'crate'; x: number; y: number; stomp: boolean }
  | { type: 'smash'; x: number; y: number }
  | { type: 'spring'; x: number; y: number }
  | { type: 'dash'; on: boolean }
  | { type: 'fastFall' }
  | { type: 'death'; cause: DeathCause; x: number; y: number; score: number; best: number; isNewRecord: boolean }
  | { type: 'newRecord'; score: number };
