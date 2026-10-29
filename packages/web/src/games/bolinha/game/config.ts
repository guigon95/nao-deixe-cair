import { ARENA_SIZE } from '../../../shared/layout/layout';
import { gameKey, HUB_KEYS } from '../../../shared/storage/keys';

/**
 * Parâmetros centralizados do jogo.
 *
 * Todas as medidas estão em "unidades lógicas" de uma arena fixa de
 * 360 × 640 (proporção 9:16). A arena é escalada uniformemente para a
 * tela, então a física é idêntica em qualquer dispositivo.
 *
 * Eixo Y cresce para baixo (convenção do Canvas).
 */

export const ARENA = {
  width: ARENA_SIZE.width,
  height: ARENA_SIZE.height,
  /** Margem superior/inferior (fração da altura) que delimita onde a bolinha pode ir. */
  marginFraction: 0.08,
} as const;

export const PHYSICS = {
  /** Passo fixo da simulação (s). 120 Hz deixa os passos curtos e estáveis. */
  fixedDt: 1 / 120,
  /** Tempo máximo acumulado por quadro (s): evita a "espiral da morte" e saltos após travamentos. */
  maxFrameTime: 0.1,
  /** Aceleração da gravidade (u/s²), para baixo. */
  gravity: 1150,
  /** Aceleração bruta do "propulsor" enquanto pressionado (u/s²), para cima. Líquido = thrust − gravity. */
  thrust: 2350,
  /**
   * Multiplicador aplicado quando a força atua contra o movimento atual
   * (segurar enquanto cai / soltar enquanto sobe). Torna a inversão de
   * direção rápida sem deixar a subida/queda “dura”.
   */
  reversalBoost: 1.55,
  /** Velocidade vertical máxima para cima (u/s). */
  maxRiseSpeed: 430,
  /** Velocidade vertical máxima para baixo (u/s). */
  maxFallSpeed: 480,
  /** Raio visual da bolinha. */
  ballRadius: 12,
  /** Fração do raio usada na colisão (hitbox levemente tolerante, prática comum para sensação de justiça). */
  hitboxScale: 0.85,
  /** Posição horizontal da bolinha (fração da largura). */
  ballXFraction: 0.28,
} as const;

export const OBSTACLES = {
  /** Largura de cada barreira. */
  width: 54,
  /** Menor vão absoluto permitido, independentemente da dificuldade (≈ 4,5× o diâmetro). */
  absoluteMinGap: 108,
  /** Distância mínima entre a borda do vão e o limite jogável. */
  gapEdgePadding: 6,
  /** Uma barreira nunca nasce a menos dessa distância horizontal da bolinha. */
  minSpawnDistanceFromBall: 220,
  /** Tempo de reação humano assumido pelo validador (s). */
  reactionTime: 0.22,
  /** Fração do deslocamento fisicamente possível que o gerador pode exigir. */
  feasibilitySafety: 0.7,
  /** Quantas tentativas o gerador faz antes de cair num padrão seguro. */
  maxGenerationAttempts: 12,
} as const;

export const SCORING = {
  pointsPerSecond: 1,
  pointsPerBarrier: 5,
} as const;

/**
 * Continuar de onde parou. Cada partida começa com `lives` vidas; ao bater
 * com vida sobrando, o jogador pode gastar uma para continuar (no futuro,
 * assistindo a um anúncio). Sem vidas, a batida encerra a partida e a
 * próxima começa do zero.
 */
export const CONTINUES = {
  lives: 3,
  /** Distância livre à frente da bolinha ao continuar (u): remove as barreiras mais próximas. */
  clearAhead: 240,
} as const;

/** Moedas no percurso (moeda da loja; não muda a pontuação do ranking). */
export const COINS = {
  /** Chance de nascer uma moeda entre duas barreiras. */
  chance: 0.35,
  /** As primeiras barreiras (aquecimento) não têm moedas. */
  skipFirst: 3,
  radius: 7,
  /** Folga extra para pegar (u). Pequena: tem que passar por cima da moeda. */
  magnet: 1,
  /**
   * Desvio da moeda para fora da linha reta entre os vãos (u): é preciso
   * sair do caminho mais seguro para pegar. Limitado ao que a física permite
   * no tempo disponível (sempre dá para pegar e ainda chegar ao próximo vão).
   */
  offsetMin: 26,
  offsetMax: 60,
  /** Fração do deslocamento fisicamente possível que o desvio pode usar. */
  offsetSafety: 0.45,
  pool: 12,
} as const;

/**
 * Cenário que varia enquanto a bolinha avança (como na Disparada), em três
 * camadas independentes — por isso as combinações mudam a cada volta:
 * - estações do ano em ciclo (verão → outono → inverno → primavera → …);
 * - hora do dia em ciclo (dia → entardecer → noite → amanhecer → …);
 * - chuva de vez em quando (sorteada por partida; no inverno vira nevasca).
 * Tudo medido em pontos e puramente visual: não muda física nem barreiras.
 */
export type SeasonId = 'verao' | 'outono' | 'inverno' | 'primavera';
export const SEASONS = {
  order: ['verao', 'outono', 'inverno', 'primavera'] as const satisfies readonly SeasonId[],
  /** Pontos de cada estação. */
  length: 90,
  /** Pontos da transição para a próxima (dentro do fim da estação). */
  blend: 30,
} as const;

export const DAY_CYCLE = {
  /** Pontos de um dia completo (dia → entardecer → noite → amanhecer). */
  length: 240,
} as const;

export const RAIN = {
  /** Pontos de cada trecho de clima. */
  segment: 60,
  /** Chance de um trecho ter chuva. */
  chance: 0.3,
  /** Começo sempre seco (pontos). */
  dryStart: 40,
  /** Tempo para a chuva chegar/ir embora (s). */
  fade: 2.5,
} as const;

/** Compatibilidade: id de cenário = estação. */
export type SceneId = SeasonId;

export const STORAGE_KEYS = {
  best: gameKey('bolinha', 'best'),
  settings: HUB_KEYS.settings,
} as const;

export const RANKING_KEY = gameKey('bolinha', 'ranking');

/** Limites verticais do centro da bolinha. */
export function ballBounds(radius: number = PHYSICS.ballRadius) {
  const margin = ARENA.height * ARENA.marginFraction;
  return { minY: margin + radius, maxY: ARENA.height - margin - radius };
}

export function playfield() {
  const margin = ARENA.height * ARENA.marginFraction;
  return { top: margin, bottom: ARENA.height - margin };
}

export const BALL_X = ARENA.width * PHYSICS.ballXFraction;
