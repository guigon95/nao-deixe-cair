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
  /** Voando (tucano): segurar bate as asas e sobe; soltar desce devagar. */
  fly?: FlyParams;
}

export interface FlyParams {
  /** Aceleração para cima segurando e velocidade máxima de subida (u/s², u/s). */
  lift: number;
  rise: number;
  /** Sem segurar: gravidade e queda máxima (plana devagar). */
  gravity: number;
  maxFall: number;
  /** Teto do voo (altura dos pés). */
  ceiling: number;
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

/** Caixotes com prêmio dentro (sorteio separado, não muda o percurso). */
export const CRATE_LOOT = {
  /** Chance de ter capim (3 a 5) e de ter um item especial. */
  capim: 0.45,
  item: 0.1,
  /** Caixote de montaria (ema): raro, só depois de um tempo e espaçado. */
  mount: 0.07,
  mountAfter: 25,
  mountGap: 30,
  capimMin: 3,
  capimMax: 5,
  /** Pulinho para fora antes de voar até a capivara (s) e velocidade do voo. */
  pop: 0.28,
  fly: 900,
  /** Distância em que a capivara "pega" o prêmio. */
  reach: 22,
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
 * As vidas são grátis. Com anúncios ligados, quando elas acabam, a tela de
 * "última chance" oferece revive(s) por anúncio com recompensa
 * (`shared/monetization`, `VITE_ADS_REWARDED_REVIVES`).
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

/** A placa "Seu recorde" só aparece a partir desta distância (m). */
export const RECORD_SIGN_MIN = 40;

/** Filhotes perdidos: pegando, entram na fila atrás da capivara e somam pontos. */
export const PUPS = {
  /** Chance por padrão, a partir de quando aparecem e intervalo mínimo (s). */
  chance: 0.22,
  firstAfter: 15,
  minGap: 10,
  /** Quantos cabem na fila e quanto cada um soma aos pontos (+25%). */
  max: 5,
  bonus: 0.25,
  /** Raio para pegar. */
  pickup: 26,
} as const;

/** Tora rolando. */
export const LOG = {
  /** Raio (altura 2r = 36: um toque curto passa). */
  r: 18,
  /** Velocidade em relação à da capivara. */
  k: 0.7,
  /** Começa a rolar quando a capivara está a este tempo do encontro (s). */
  lead: 1.4,
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
  /** Na saída, lança de novo quem estiver subindo mais devagar que isto (um pulo comum). */
  relaunchBelow: 900,
  /** Quanto a câmera desce para mostrar a toca. */
  camera: -130,
} as const;

/**
 * Montarias: saem de um caixote e correm do lado; pulando nelas, a capivara
 * monta. Montada: mais rápida. Batendo num obstáculo, a capivara pula fora
 * (sem perder vida) e a montaria dispara embora.
 */
export const MOUNT = {
  /** Rampa da velocidade extra (s). */
  ramp: 0.4,
  /** Quanto tempo a montaria solta espera a capivara (s) e quanto à frente corre. */
  freeTime: 5,
  ahead: 55,
  /** Fugindo: velocidade em relação à da capivara. */
  flee: 1.8,
  /** Janela para montar: distância em x e altura dos pés acima da montaria. */
  catchDx: 30,
  catchMin: 12,
  catchMax: 90,
  /** Pulinho ao cair da montaria (× pulo normal). */
  hop: 0.75,
  /** Tucano: quanto tempo voa antes de cansar (s) e altura em que espera solto. */
  tucanoTime: 10,
  tucanoHover: 72,
} as const;

/**
 * Voando de tucano: trilhas de capim no céu (ondas, rampas, zigue-zague)
 * para guiar o voo. As inclinações respeitam o quanto o tucano sobe e desce.
 */
export const SKY_TRAIL = {
  /** Distância entre capins na trilha (u). */
  spacing: 34,
  /** Faixa de altura dos pés da capivara carregada. */
  low: 60,
  high: 205,
  /** Inclinação máxima (dy/dx): o tucano sobe ~380 u/s e desce ~330 u/s. */
  maxSlope: 0.45,
  /** Gera trilhas até esta distância à frente e começa logo depois da tela. */
  ahead: 950,
  firstGap: 220,
} as const;

export type MountAnimal = 'ema' | 'anta' | 'tucano';

export interface MountSpec {
  /** Velocidade extra montada (fração). */
  speed: number;
  /** Parâmetros do pulo montada. */
  jump: JumpParams;
  /** Atropela caixotes e espinhos sem cair (só pedra derruba). */
  tank: boolean;
}

export const MOUNTS: Record<MountAnimal, MountSpec> = {
  /** Ema: a mais rápida (+30%) e pula mais alto. */
  ema: { speed: 0.3, jump: { ...JUMP, jumpVelocity: 1060 }, tank: false },
  /** Anta: +15%, pesada (pulo normal), mas atropela caixotes e espinhos. */
  anta: { speed: 0.15, jump: JUMP, tank: true },
  /** Tucano: +20% e voa segurando (cansa depois de um tempo). */
  tucano: { speed: 0.2, jump: { ...JUMP, fly: { lift: 2600, rise: 380, gravity: 900, maxFall: 330, ceiling: 230 } }, tank: false },
};

/** Chão: abaixo disso, dentro de um buraco, a capivara caiu no rio do jacaré. */
export const PIT_DEATH_Y = -14;

export const STORAGE = {
  best: gameKey('corrida', 'best'),
  ranking: gameKey('corrida', 'ranking'),
  /** Já viu o aviso de que dá para jogar com o celular deitado. */
  rotateSeen: 'ndc:corrida:rotateSeen',
  /** Maior distância já corrida (m): a placa "Seu recorde" fica nesse ponto. */
  bestMeters: 'ndc:corrida:bestMeters',
} as const;
