/**
 * Parâmetros centralizados da Disparada (corrida infinita lateral).
 *
 * Coordenadas do MUNDO: x cresce para a direita, y cresce para CIMA, e o
 * chão fica em y = 0. Só a renderização converte para o eixo do Canvas.
 * Unidades = unidades da arena (640 × 360, paisagem).
 *
 * Tudo que é "tempo" nos padrões de obstáculos é medido em segundos e
 * convertido em distância pela velocidade do momento: assim um padrão exige
 * o mesmo tempo de pulo em qualquer velocidade (ver `patterns.ts`).
 */

import { gameKey } from '../../../shared/storage/keys';
import type { ItemKind } from './types';

/** Arena lógica em paisagem: a corrida lateral precisa de visão à frente. */
export const ARENA = { width: 640, height: 360 } as const;

export const SIM = {
  /** Passo fixo da simulação (s). */
  fixedDt: 1 / 120,
  /** Tempo máximo simulado por quadro (s): aba voltando não teleporta. */
  maxFrameTime: 0.1,
} as const;

export const BODY = {
  /** Caixa de colisão (pés no meio da base). Um pouco menor que o desenho: perdoa raspões. */
  halfWidth: 13,
  height: 34,
  /** Posição da capivara na tela (x da arena). */
  screenX: 150,
} as const;

export interface JumpParams {
  /** Gravidade subindo (u/s²). */
  gravityUp: number;
  /** Gravidade caindo (u/s²): um pouco maior, o pulo fica "firme". */
  gravityDown: number;
  /** Velocidade inicial do pulo (u/s). */
  jumpVelocity: number;
  /** Ao soltar subindo, a subida é cortada para esta velocidade (pulo variável). */
  releaseVelocity: number;
  /** Pulo mínimo: o corte só vale depois deste tempo subindo (toque muito rápido ainda passa uma pedra). */
  minCut: number;
  /** Velocidade máxima de queda (u/s). */
  maxFall: number;
  /** Planar (segurar caindo): gravidade e queda máxima. */
  glideGravity: number;
  glideMaxFall: number;
  /** Tempo máximo planando por pulo (s). */
  glideMax: number;
  /** Descer rápido (deslizar para baixo). */
  fastFallVelocity: number;
  /** Tolerância depois de sair da beirada (s) — "coyote time". */
  coyote: number;
  /** Toque pouco antes de pousar vale como pulo ao pousar (s). */
  jumpBuffer: number;
  /** Mola (flor-trampolim). */
  springVelocity: number;
  /** Quicar em cima de um caixote. */
  crateBounceVelocity: number;
}

export const JUMP: JumpParams = {
  gravityUp: 2700,
  gravityDown: 3000,
  jumpVelocity: 930,
  releaseVelocity: 380,
  minCut: 0.08,
  maxFall: 1350,
  glideGravity: 700,
  glideMaxFall: 165,
  glideMax: 0.9,
  fastFallVelocity: 1300,
  coyote: 0.09,
  jumpBuffer: 0.12,
  springVelocity: 1330,
  crateBounceVelocity: 640,
};

/** Cipós de balançar. */
export const VINE = {
  /** Gravidade do pêndulo (u/s²). */
  gravity: 2100,
  /** Solta sozinha ao passar deste ângulo para a frente (rad): nunca fica presa. */
  releaseAngle: 0.85,
  /** Impulso extra para cima ao soltar (u/s). */
  releaseBoost: 300,
  /** Distância horizontal do corpo ao cipó para agarrar (u). */
  grabReach: 14,
  /** Depois de soltar, não agarra de novo por este tempo (s). */
  cooldown: 0.45,
  /** Margem de energia: o balanço sempre chega ao ângulo de soltar (×). */
  minEnergy: 1.15,
} as const;

/** Ímã de capim: item raro que puxa os capins próximos por alguns segundos. */
export const MAGNET = {
  /** Duração (s). */
  duration: 8,
  /** Alcance (u) em volta da capivara (mais para a frente que para trás). */
  reachAhead: 190,
  reachBehind: 60,
  reachUp: 190,
  /** Velocidade com que o capim voa até a capivara (u/s, além da corrida). */
  pull: 700,
  /** Distância para comer o capim puxado. */
  eat: 20,
  /** Raio para pegar o próprio ímã. */
  pickup: 22,
  /** Não aparece antes disto (s) e espera pelo menos isto entre um e outro. */
  firstAfter: 12,
  minGap: 22,
  /** Chance por padrão, passado o intervalo. */
  chance: 0.35,
  /** Embalo: velocidade a mais enquanto o ímã dura (+10%), com rampa de 0,5 s. */
  boost: 0.1,
  boostRamp: 0.5,
} as const;

/**
 * Itens especiais no percurso: de vez em quando um capim vira um item. Um
 * sorteio só para todos (nunca dois perto), com peso por tipo.
 */
export const ITEMS = {
  /** Não aparece antes disto (s) e espera pelo menos isto entre itens. */
  firstAfter: 12,
  minGap: 14,
  /** Chance por padrão, passado o intervalo. */
  chance: 0.4,
  weights: { magnet: 3, shield: 2, golden: 2, acai: 2 } as Record<ItemKind, number>,
  /** Raio para pegar um item. */
  pickup: 22,
} as const;

/** Capim dourado: dobra os pontos (metros, capins e bônus) por um tempo. */
export const GOLDEN = {
  duration: 10,
  mult: 2,
} as const;

/** Escudo de vitória-régia: aguenta uma batida (pedra, espinho ou queda no rio). */
export const SHIELD = {
  /** Depois de salvar, ainda quebra o que encostar por este tempo (s). */
  grace: 0.6,
} as const;

/** Velocidade da corrida (u/s) em função do tempo de partida. */
export const SPEED = {
  start: 290,
  max: 480,
  /** Constante de tempo da aproximação exponencial ao máximo (s). */
  tau: 70,
} as const;

export const DASH = {
  /** Capins para encher o medidor. */
  meterMax: 12,
  duration: 0.85,
  speedFactor: 1.65,
  /** Impulso para cima no fim (para não terminar já despencando). */
  exitVelocity: 360,
  /** Depois do dash, ainda quebra pedras por este tempo (s): sem morte injusta na saída. */
  tail: 0.22,
} as const;

/** Enxame de marimbondos que persegue a capivara (distância atrás dele, em u). */
export const SWARM = {
  start: 120,
  /** Distância "confortável": o enxame não se afasta além disso. */
  rest: 280,
  /** Quanto o enxame fica para trás por segundo quando a capivara corre normal. */
  recover: 40,
  /** Batida em caixote: velocidade cai para esta fração e volta em `slowRecover` s. */
  slowFactor: 0.3,
  slowRecover: 1.3,
  /** Abaixo disso, o som de perigo e o aviso aparecem. */
  warn: 130,
} as const;

export const SCORING = {
  /** Unidades por metro. */
  unitsPerMeter: 10,
  /** Pontos por capim. */
  fruit: 5,
  /** Quebrar algo durante o dash. */
  smash: 10,
  /** Quicar num caixote. */
  stomp: 10,
} as const;

/**
 * Vidas por partida para continuar de onde parou (mesma regra da Bolinha).
 * Hoje continuar é grátis; com anúncios ligados, cada continuação pede um
 * anúncio com recompensa (`shared/ads/rewarded.ts`).
 */
export const CONTINUES = {
  lives: 3,
  /** Trecho livre à frente ao continuar (s de corrida): sem obstáculos nem rio. */
  clearAhead: 1.8,
  /** Trecho livre atrás (u): chão sob a capivara mesmo se caiu no rio. */
  clearBehind: 200,
  /** O enxame volta para esta distância (u). */
  swarm: 240,
} as const;

/** Toca: caminho por baixo da terra. */
export const TOCA = {
  /**
   * Chão e teto da toca (abaixo da superfície). O buraco é fundo (sensação de
   * queda); o túnel tem uma camada grossa de terra por cima e teto baixo.
   */
  floor: -170,
  roof: -90,
  /** Abaixo disto a capivara está "na toca" (câmera desce, eventos). */
  below: -20,
  /** Na saída: anda isto dentro do buraco e é lançada para cima (u/s). */
  launchAfter: 12,
  /** Lançamento da saída: joga a capivara bem para o alto (~250 acima do chão). */
  exitVelocity: 1500,
  /** Quanto a câmera desce para mostrar a toca. */
  camera: -130,
} as const;

/** Chão: abaixo disso, dentro de um buraco, a capivara caiu no rio do jacaré. */
export const PIT_DEATH_Y = -14;

export const STORAGE = {
  best: gameKey('corrida', 'best'),
  ranking: gameKey('corrida', 'ranking'),
} as const;
