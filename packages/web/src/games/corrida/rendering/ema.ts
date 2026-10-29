/**
 * Ema (Rhea americana), a montaria da capivara: corpo de penas cinza-pardas
 * caídas, pescoço comprido, cabeça pequena e pernas longas. Desenho original,
 * em coordenadas de tela (y para baixo; `y` = altura dos pés).
 */

const FEATHER = '#a0947f';
const FEATHER_DARK = '#7c7262';
const FEATHER_LIGHT = '#c4b9a4';
const LEG = '#d8c08a';
const LEG_DARK = '#a88f58';
const BEAK = '#e8c66a';

export interface EmaLook {
  /** Fase da corrida (rad). */
  run: number;
  /** No ar: pernas encolhidas. */
  air: boolean;
  /** Pescoço esticado para frente (fugindo / montada correndo). */
  lean: number;
}

/** Altura (tela) em que a capivara senta nas costas da ema. */
export const EMA_SEAT_DRAW = 50;

export function drawEma(ctx: CanvasRenderingContext2D, x: number, y: number, o: EmaLook): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const bob = o.air ? 0 : -Math.abs(Math.sin(o.run)) * 2.5;
  // Pernas (atrás do corpo).
  for (let i = 0; i < 2; i++) {
    const a = o.run + i * Math.PI;
    const hipX = -2 + i * 4;
    const hipY = -38 + bob;
    let kx: number;
    let ky: number;
    let fx: number;
    let fy: number;
    if (o.air) {
      kx = hipX + 10;
      ky = hipY + 12;
      fx = kx - 8 + i * 4;
      fy = ky + 14;
    } else {
      const s = Math.sin(a);
      kx = hipX + s * 9 + 4;
      ky = hipY + 18;
      fx = hipX + s * 20;
      fy = -Math.max(0, Math.cos(a)) * 7;
    }
    ctx.strokeStyle = i === 0 ? LEG_DARK : LEG;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kx, ky);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    // Dedos.
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 6, fy + 1);
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx - 4, fy + 1);
    ctx.stroke();
  }
  ctx.translate(0, bob);
  // Rabo de penas.
  ctx.fillStyle = FEATHER_DARK;
  ctx.beginPath();
  ctx.moveTo(-24, -52);
  ctx.quadraticCurveTo(-40, -50, -36, -34);
  ctx.quadraticCurveTo(-28, -40, -20, -40);
  ctx.closePath();
  ctx.fill();
  // Corpo de penas (borda de baixo em franjas).
  ctx.fillStyle = FEATHER;
  ctx.beginPath();
  ctx.moveTo(-26, -46);
  ctx.quadraticCurveTo(-22, -66, 2, -64);
  ctx.quadraticCurveTo(22, -62, 22, -46);
  for (let k = 0; k <= 6; k++) {
    const fx = 22 - (48 * k) / 6;
    ctx.lineTo(fx - 4, -34 + (k % 2) * 3);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = FEATHER_DARK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-14, -50);
  ctx.quadraticCurveTo(-4, -44, 8, -48);
  ctx.moveTo(-18, -42);
  ctx.quadraticCurveTo(-8, -38, 4, -41);
  ctx.stroke();
  // Pescoço e cabeça.
  const lean = o.lean;
  const hx = 34 + lean * 8;
  const hy = -92 + lean * 14;
  ctx.strokeStyle = FEATHER_LIGHT;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(14, -58);
  ctx.quadraticCurveTo(22 + lean * 6, -70, hx - 2, hy + 4);
  ctx.stroke();
  ctx.strokeStyle = FEATHER_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, -62);
  ctx.quadraticCurveTo(24 + lean * 6, -72, hx - 3, hy + 9);
  ctx.stroke();
  ctx.fillStyle = FEATHER_LIGHT;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 6.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BEAK;
  ctx.beginPath();
  ctx.moveTo(hx + 4, hy - 2);
  ctx.lineTo(hx + 14, hy + 1);
  ctx.lineTo(hx + 4, hy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#1d1a14';
  ctx.beginPath();
  ctx.arc(hx + 1.5, hy - 1.2, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
