/** Jogos do hub que têm ranking online. Mesmo id usado no front (src/shared/storage/keys.ts). */
export const GAME_IDS = ['bolinha', 'aviao', 'corrida'] as const;
export type GameId = (typeof GAME_IDS)[number];

/**
 * Teto de pontuação plausível para o tempo de partida (anti-trapaça simples).
 * É generoso de propósito: só barra números impossíveis, nunca um jogador real.
 * - bolinha: 1 ponto/s + 5 por barreira (bem abaixo de 20/s mesmo no máximo).
 * - aviao: distância + manobras × combo até ×8 (um loop vale até 800).
 * - corrida: ~48 m/s no máximo (×1,65 no dash) + 5 por jabuticaba + 10 por quebra.
 */
export const SCORE_LIMITS: Record<GameId, { perSecond: number; slack: number }> = {
  bolinha: { perSecond: 25, slack: 30 },
  aviao: { perSecond: 800, slack: 1000 },
  corrida: { perSecond: 200, slack: 300 },
};

export const MAX_SCORE = 10_000_000;
export const RANKING_SIZE = 10;
