import type { MountAnimal } from '../game/config';
import { drawAnta, ANTA_SEAT_DRAW } from './anta';
import { drawEma, EMA_SEAT_DRAW } from './ema';

export interface MountLook {
  run: number;
  air: boolean;
  /** Pescoço esticado (ema fugindo). */
  lean: number;
}

/** Altura (tela) em que a capivara senta em cada montaria. */
export const MOUNT_SEAT_DRAW: Record<MountAnimal, number> = { ema: EMA_SEAT_DRAW, anta: ANTA_SEAT_DRAW };

/** Nome com artigo, para as mensagens ("UMA EMA!", "NA ANTA"). */
export const MOUNT_NAMES: Record<MountAnimal, { a: string; na: string; da: string; nome: string }> = {
  ema: { a: 'UMA EMA', na: 'NA EMA', da: 'DA EMA', nome: 'EMA' },
  anta: { a: 'UMA ANTA', na: 'NA ANTA', da: 'DA ANTA', nome: 'ANTA' },
};

export function drawMount(ctx: CanvasRenderingContext2D, animal: MountAnimal, x: number, y: number, o: MountLook): void {
  if (animal === 'anta') drawAnta(ctx, x, y, o);
  else drawEma(ctx, x, y, o);
}
