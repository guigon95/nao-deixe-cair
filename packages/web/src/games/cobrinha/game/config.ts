/**
 * Parâmetros do Fominha (cobrinha).
 *
 * A arena lógica é a mesma do hub (360 × 640). O tabuleiro é uma grade de
 * células quadradas; tudo da simulação é em células inteiras e só a
 * renderização interpola entre um passo e o próximo.
 */
import { ARENA_SIZE } from '../../../shared/layout/layout';
import { gameKey, HUB_KEYS } from '../../../shared/storage/keys';

export const ARENA = ARENA_SIZE;

export const GRID = {
  cols: 15,
  rows: 24,
  /** Tamanho da célula em unidades da arena. */
  cell: 22,
  /** Canto superior esquerdo do tabuleiro na arena. */
  x: 15,
  y: 82,
} as const;

export const SPEED = {
  /** Intervalo entre passos no começo (s). ~6,7 passos por segundo. */
  startStep: 0.15,
  /** Intervalo mínimo (s): ~13 passos por segundo — rápido, mas jogável. */
  minStep: 0.075,
  /** Quanto o passo encurta por item comido (s). */
  perItem: 0.0026,
} as const;

/** Tamanho inicial da cobrinha (cabeça incluída). */
export const START_LENGTH = 4;

/** Tamanhos que disparam uma comemoração. */
export const MILESTONES = [10, 20, 30, 45, 60, 80, 100] as const;

/** Duração do multiplicador da mala (s de jogo). */
export const MULTIPLIER_TIME = 8;

export type ItemKind = 'chocolate' | 'dinheiro' | 'ouro' | 'rachadinha' | 'mansao' | 'jatinho' | 'mala';

export interface ItemSpec {
  kind: ItemKind;
  name: string;
  points: number;
  /** Quantos segmentos a cobrinha ganha. */
  grow: number;
  /** Peso no sorteio (quanto maior, mais comum). */
  weight: number;
  /** Itens raros somem se não forem pegos a tempo (s). 0 = não somem. */
  life: number;
  /** Comprimento mínimo da cobrinha para o item poder aparecer. */
  minLength: number;
  /** Cor de destaque (partículas, texto flutuante, segmento). */
  color: string;
}

export const ITEMS: Record<ItemKind, ItemSpec> = {
  chocolate: { kind: 'chocolate', name: 'Bombom', points: 10, grow: 1, weight: 30, life: 0, minLength: 0, color: '#8b4a2b' },
  dinheiro: { kind: 'dinheiro', name: 'Maço de dinheiro', points: 20, grow: 1, weight: 28, life: 0, minLength: 0, color: '#4fbf6a' },
  ouro: { kind: 'ouro', name: 'Barra de ouro', points: 30, grow: 1, weight: 16, life: 0, minLength: 6, color: '#ffcc33' },
  rachadinha: { kind: 'rachadinha', name: 'Rachadinha', points: 40, grow: 2, weight: 12, life: 0, minLength: 8, color: '#9be15d' },
  mansao: { kind: 'mansao', name: 'Mansão', points: 50, grow: 2, weight: 7, life: 9, minLength: 10, color: '#ff9fce' },
  jatinho: { kind: 'jatinho', name: 'Jatinho', points: 70, grow: 1, weight: 4, life: 6, minLength: 14, color: '#7fd3ff' },
  mala: { kind: 'mala', name: 'Mala de dinheiro', points: 25, grow: 1, weight: 5, life: 7, minLength: 6, color: '#ffd23f' },
};

export const ITEM_KINDS = Object.keys(ITEMS) as ItemKind[];

/** Chance, a cada item comum comido, de aparecer também um item raro (além do comum). */
export const BONUS_CHANCE = 0.22;

export const STORAGE = {
  best: gameKey('cobrinha', 'best'),
  ranking: gameKey('cobrinha', 'ranking'),
  settings: HUB_KEYS.settings,
} as const;

/** Mensagens de fim de partida (sorteadas). */
export const GAME_OVER_LINES = [
  'A fome não tem limites!',
  'Não conseguiu administrar o patrimônio!',
  'A cobrinha cresceu demais!',
  'O estoque acabou!',
  'Você comeu mais do que conseguia carregar!',
  'Sessão encerrada por falta de quórum!',
  'Pedido de vista: volte na próxima partida.',
  'Engoliu o próprio orçamento!',
  'Bateu na parede do Plenário!',
] as const;
