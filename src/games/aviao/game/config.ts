/**
 * Parâmetros centralizados do avião acrobata.
 *
 * Coordenadas do MUNDO: x cresce para a direita, y cresce para CIMA
 * (altitude). Só a renderização converte para o eixo do Canvas.
 * Unidades lógicas iguais às da arena 360 × 640 do hub (a câmera aproxima
 * e afasta, mas 1 unidade de mundo = 1 unidade de arena com zoom 1).
 *
 * Ângulos em radianos. `phi` é o ângulo da trajetória: 0 = voando para a
 * direita, +π/2 = subindo na vertical. A física é "arcade baseada em
 * energia": o nariz acompanha a trajetória, a velocidade troca com a
 * altura, a sustentação cresce com velocidade².
 */

import { ARENA_SIZE } from '../../../shared/layout/layout';
import { gameKey, HUB_KEYS } from '../../../shared/storage/keys';

export const ARENA = ARENA_SIZE;

export const SIM = {
  /** Passo fixo da simulação (s). */
  fixedDt: 1 / 120,
  /** Tempo máximo simulado por quadro (s): sem "espiral da morte". */
  maxFrameTime: 0.1,
} as const;

export interface FlightParams {
  /** Gravidade (u/s²). */
  gravity: number;
  /** Aceleração máxima do motor com potência 1 (u/s²). */
  thrust: number;
  /** Arrasto parasita: a = k·v² (define a velocidade máxima nivelada). */
  drag: number;
  /** Arrasto extra ao puxar (manobra custa energia): a = k·v·puxada. */
  pullDrag: number;
  /** Subida da potência ao segurar (1/s) e queda ao soltar (1/s). */
  throttleUp: number;
  throttleDown: number;
  /** Potência mínima ao soltar (marcha lenta). */
  idle: number;
  /**
   * Sustentação de "equilíbrio" sem tocar: a = cTrim·v². Ela tenta levar a
   * trajetória ao nível (correção leve de nivelamento); abaixo de
   * √(g/cTrim) não vence a gravidade e o nariz cai devagar.
   */
  cTrim: number;
  /**
   * Fração da correção de nível quando invertido (voando para trás). Menor
   * que 1: de cabeça para baixo o avião só se mantém nivelado se estiver
   * rápido; devagar, o nariz cai e o loop se completa sozinho.
   */
  invertedTrim: number;
  /**
   * Recuperação de mergulho: em mergulho íngreme a correção sempre puxa
   * para o lado da cabine (sai do mergulho para a frente), com pelo menos
   * esta fração do efeito — nunca há mergulho vertical sem saída.
   */
  diveRecoveryMin: number;
  /** Sustentação extra ao puxar: a = cPull·v² (é ela que faz curvas e loops). */
  cPull: number;
  /** Força ao empurrar o manche (puxada negativa): a = cPush·v²·puxada. Mais forte que puxar: soltar mergulha na hora. */
  cPush: number;
  /** Limite de carga: a sustentação total nunca passa de maxG·g. */
  maxG: number;
  /** Velocidade de estol (u/s) e faixa de transição (fração acima dela). */
  stallSpeed: number;
  stallBand: number;
  /** Rotação extra do nariz para baixo durante o estol (rad/s). */
  stallPitchRate: number;
  /** Rotação máxima do nariz (rad/s). */
  maxTurnRate: number;
  /** Velocidade mínima numérica (u/s). */
  minSpeed: number;
  /** Ar rarefeito: a partir desta altitude o motor e as asas perdem força... */
  thinAirStart: number;
  /** ...até este fator mínimo nesta altitude. Não há parede: só falta de ar. */
  thinAirEnd: number;
  thinAirMin: number;
}

export const FLIGHT: FlightParams = {
  gravity: 400,
  thrust: 560,
  drag: 0.0028,
  pullDrag: 0.55,
  throttleUp: 5,
  throttleDown: 3.2,
  idle: 0.12,
  cTrim: 0.0068,
  invertedTrim: 0.55,
  diveRecoveryMin: 0.8,
  cPull: 0.0115,
  cPush: 0.024,
  maxG: 6,
  stallSpeed: 105,
  stallBand: 0.3,
  stallPitchRate: 3.2,
  maxTurnRate: 5.5,
  minSpeed: 25,
  thinAirStart: 1050,
  thinAirEnd: 1450,
  thinAirMin: 0.12,
};

export const PLANE = {
  /** Comprimento visual do avião (u). A hitbox é bem menor que o desenho. */
  length: 38,
  /** Hitbox: dois círculos (centro e nariz), tolerantes. */
  hitRadius: 6.5,
  noseOffset: 9,
  /** Velocidade inicial (u/s) e altitude inicial acima do chão (u). */
  startSpeed: 230,
  startAltitude: 260,
} as const;

export const GROUND = {
  /** Altitude média do chão (o relevo oscila em torno dela). */
  base: 0,
  /** Amplitude do relevo no começo e no máximo da dificuldade. */
  amplitudeStart: 26,
  amplitudeMax: 120,
  /** Ângulo máximo (rad) entre trajetória e chão que ainda é um rasante, não uma batida. */
  skidAngle: 0.52,
  /** Perda de velocidade por segundo enquanto rola/raspa no chão (fração). */
  skidFriction: 0.9,
  /** Abaixo desta fração da velocidade de estol, encostado no chão = batida (não dá para "pousar"). */
  minSkidSpeed: 1.1,
  /** Tempo de tolerância (s): uma batida de bico logo depois de encostar ainda conta como rasante. */
  coyoteTime: 0.12,
} as const;

export const CAMERA = {
  /** Posição horizontal do avião na tela (fração da largura). */
  planeX: 0.34,
  /** Zoom com o avião lento / rápido. */
  zoomSlow: 1.0,
  zoomFast: 0.72,
  /** Zoom mínimo quando o avião está alto (para ver o chão). */
  zoomMin: 0.55,
  /** Suavização (1/s) da câmera. */
  follow: 4.5,
  zoomFollow: 1.6,
} as const;

export const SCORING = {
  /** Pontos por unidade de distância horizontal (u). */
  pointsPerUnit: 1 / 40,
  loop: 100,
  halfLoop: 40,
  rasante: 40,
  /** Pontos por segundo de voo invertido (contados ao endireitar). */
  invertedPerSecond: 30,
  invertedMin: 0.6,
  stallRecovery: 60,
  graze: 25,
  ring: 50,
  /** Janela (s) para encadear a próxima manobra sem perder o combo. */
  comboWindow: 4,
  comboMax: 8,
} as const;

export const MANEUVERS = {
  /** Rotação acumulada para cima que conta um loop / meio loop. */
  loopAngle: Math.PI * 2,
  halfLoopAngle: Math.PI,
  /** Uma rotação para o outro lado maior que isso zera o acumulado. */
  reverseReset: 0.9,
  /** Meio loop: depois de 180°, precisa sair "nivelado" (|sen φ| pequeno) por este tempo. */
  halfLoopLevelSin: 0.45,
  halfLoopHold: 0.35,
  /** Rasante: altura máxima acima do chão, velocidade mínima e altura de saída. */
  rasanteHeight: 34,
  rasanteSpeed: 300,
  rasanteExit: 90,
  /** Raspão: distância extra além da hitbox. */
  grazeMargin: 16,
  /** Câmera lenta ao completar manobra grande (s e fator de tempo). */
  slowmoTime: 0.16,
  slowmoScale: 0.35,
} as const;

export const STORAGE = {
  best: gameKey('aviao', 'best'),
  ranking: gameKey('aviao', 'ranking'),
  settings: HUB_KEYS.settings,
} as const;
