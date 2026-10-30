import type { MountAnimal } from './config';
export const GameState = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  RESUMING: 'RESUMING',
  /** Bateu com vida sobrando (ou, sem vidas, com revive por anúncio disponível): continuar ou encerrar. */
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
  /** Cupinzeiro (Cerrado): mais alto, de terra vermelha; dá para subir em cima. */
  kind?: 'cupim';
}

/** Lama (Pantanal): correndo nela a capivara fica lenta; pulando, passa. */
export interface Mud {
  x0: number;
  x1: number;
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

/**
 * Tora rolando em direção à capivara. A posição depende de ONDE a capivara
 * está (e não do relógio): parada em `x0` até a capivara passar de `trig`;
 * dali em diante anda `k` unidades para trás a cada unidade que a capivara
 * anda. Assim o planejador (e os testes de justiça) enxergam a tora com a
 * mesma física do jogo.
 */
export interface Log {
  x0: number;
  trig: number;
  /** Velocidade da tora em relação à da capivara (0,7 = 70%). */
  k: number;
  /** Raio (a tora tem 2r de altura). */
  r: number;
  broken: boolean;
  /** Já começou a rolar / já passou pela capivara (avisos e missão). */
  rolling: boolean;
  passed: boolean;
}

/** Filhote de capivara perdido, esperando no caminho. */
export interface Pup {
  x: number;
  taken: boolean;
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

export type CrateLoot = { kind: 'capim'; n: number } | { kind: 'item'; item: ItemKind } | { kind: 'mount'; animal: MountAnimal };

/** Montaria: solta (esperando a capivara pular nela), montada ou fugindo. */
export interface Mount {
  animal: MountAnimal;
  state: 'free' | 'ridden' | 'fleeing';
  x: number;
  y: number;
  vy: number;
  /** Tempo no estado atual (s). */
  t: number;
}

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
  /** Mandacaru (Caatinga): cacto alto e estreito, cheio de espinhos. */
  kind?: 'mandacaru';
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
  /** Montada na anta: atropela caixotes e espinhos. */
  tank: boolean;
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

export type DeathCause = 'rock' | 'thorns' | 'river' | 'swarm' | 'log';

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
  | { type: 'mud'; x: number }
  | { type: 'pup'; phase: 'join' | 'lost'; count: number; x: number; y: number }
  | { type: 'log'; phase: 'roll' | 'dodge'; x: number }
  | { type: 'mount'; phase: 'appear' | 'ride' | 'off'; animal: MountAnimal; x: number; y: number; reason?: 'hit' | 'river' | 'toca' | 'timeout' | 'tired' }
  | { type: 'loot'; x: number; y: number; kind: 'capim' | ItemKind; n: number }
  | { type: 'burrow'; on: boolean; x: number; y: number }
  | { type: 'golden'; on: boolean; x: number; y: number }
  | { type: 'shield'; on: boolean; x: number; y: number; saved?: DeathCause }
  | { type: 'fastFall' }
  | { type: 'death'; cause: DeathCause; x: number; y: number; score: number; best: number; isNewRecord: boolean; livesLeft: number; adRevivesLeft: number }
  | { type: 'continue'; livesLeft: number; via: 'life' | 'ad' }
  | { type: 'newRecord'; score: number }
  | { type: 'recordSign'; x: number };
