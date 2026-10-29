import type { MountAnimal } from '../game/config';
import { drawAnta, ANTA_SEAT_DRAW } from './anta';
import { drawEma, EMA_SEAT_DRAW } from './ema';
import { drawTucano } from './tucano';

export interface MountLook {
  run: number;
  air: boolean;
  /** Pescoço esticado (ema fugindo). */
  lean: number;
}

/** Altura (tela) em que a capivara senta em cada montaria. */
export const MOUNT_SEAT_DRAW: Record<MountAnimal, number> = { ema: EMA_SEAT_DRAW, anta: ANTA_SEAT_DRAW, tucano: 0 };

/** Tucano: voa esta altura (tela) acima dos pés da capivara que carrega. */
export const TUCANO_CARRY_DRAW = 26;

/** Nome com artigo, para as mensagens ("UMA EMA!", "NA ANTA"). */
export const MOUNT_NAMES: Record<MountAnimal, { a: string; pule: string; montada: string; da: string; salvou: string }> = {
  ema: { a: 'UMA EMA', pule: 'PULE NELA', montada: 'MONTADA NA EMA', da: 'DA EMA', salvou: 'A EMA' },
  anta: { a: 'UMA ANTA', pule: 'PULE NELA', montada: 'MONTADA NA ANTA', da: 'DA ANTA', salvou: 'A ANTA' },
  tucano: { a: 'UM TUCANO', pule: 'PULE ATÉ ELE', montada: 'VOANDO DE TUCANO! SEGURE PARA SUBIR', da: 'DO TUCANO', salvou: 'O TUCANO' },
};

export function drawMount(ctx: CanvasRenderingContext2D, animal: MountAnimal, x: number, y: number, o: MountLook): void {
  if (animal === 'anta') drawAnta(ctx, x, y, o);
  else if (animal === 'tucano') drawTucano(ctx, x, y - TUCANO_CARRY_DRAW, { flap: o.run * 3, blink: false });
  else drawEma(ctx, x, y, o);
}
