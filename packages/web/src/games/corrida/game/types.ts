export const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  /** Bateu com vida sobrando: escolhe continuar (anúncio, no futuro) ou encerrar. */
  CONTINUE: 'CONTINUE',
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
  /** 'galho' (padrão) ou 'copa' (caminho alto pelas copas das árvores). */
  kind?: 'galho' | 'copa' | 'vitoria';
}

/**
 * Toca da capivara: caminho por baixo da terra. Entra-se por um buraco
 * escondido sob folhas [x0, holeEnd] e sai-se pelo buraco [exitStart, x1],
 * que lança a capivara de volta para a superfície.
 */
export interface Burrow {
  x0: number;
  holeEnd: number;
  exitStart: number;
  x1: number;
  /** Altura do chão da toca (negativa). */
  floor: number;
  /** Altura do teto (embaixo da grama). */
  roof: number;
  /** A capivara já caiu por aqui (as folhas que tampavam rasgaram). */
  opened: boolean;
}

/** Caixote: atravessar atrasa (o enxame chega perto); cair em cima quica. */
export interface Crate {
  x0: number;
  x1: number;
  top: number;
  broken: boolean;
  /** Tempo desde a quebra (efeito). */
  brokenAt: number;
  /** O que tem dentro (sai voando até a capivara quando quebra). */
  loot?: CrateLoot;
}

export type CrateLoot = { kind: 'capim'; n: number } | { kind: 'item'; item: ItemKind };

/** Prêmio saindo de um caixote: pula para fora e voa até a capivara. */
export interface Loot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Tempo desde que saiu (s). */
  t: number;
  /** 'capim' ou um item especial. */
  kind: 'capim' | ItemKind;
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

/**
 * Cipó de balançar: pendurado em (ax, ay), comprimento `len`. A capivara
 * agarra sozinha ao encostar nele no ar e é lançada para a frente ao soltar.
 */
export interface Vine {
  ax: number;
  ay: number;
  len: number;
}

/** Itens especiais do percurso. */
export type ItemKind = 'magnet' | 'shield' | 'golden' | 'acai';

/** Item especial no percurso. */
export interface PowerUp {
  x: number;
  y: number;
  kind: ItemKind;
  taken: boolean;
}

export interface Fruit {
  x: number;
  y: number;
  taken: boolean;
  /** Fora do caminho seguro (vale o mesmo, mas o desenho brilha um pouco mais). */
  risky: boolean;
}

/** Estado físico da capivara. Objeto simples: dá para clonar (piloto automático). */
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
  /** Pendurada num cipó. */
  swinging: boolean;
  /** Cipó atual: âncora, raio, ângulo (0 = na vertical, + = para a frente) e velocidade angular. */
  swAx: number;
  swAy: number;
  swL: number;
  swTh: number;
  swOm: number;
  /** Tempo sem poder agarrar de novo depois de soltar (s). */
  vineCooldown: number;
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
  | { type: 'vine'; on: boolean; x: number; y: number }
  | { type: 'canopy'; x: number; y: number }
  | { type: 'magnet'; on: boolean; x: number; y: number }
  | { type: 'acai'; x: number; y: number }
  | { type: 'loot'; x: number; y: number; kind: 'capim' | ItemKind; n: number }
  | { type: 'burrow'; on: boolean; x: number; y: number }
  | { type: 'golden'; on: boolean; x: number; y: number }
  | { type: 'shield'; on: boolean; x: number; y: number; saved?: DeathCause }
  | { type: 'fastFall' }
  | { type: 'death'; cause: DeathCause; x: number; y: number; score: number; best: number; isNewRecord: boolean; livesLeft: number }
  | { type: 'continue'; livesLeft: number }
  | { type: 'newRecord'; score: number };
