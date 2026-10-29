/**
 * O quati (personagem original), desenhado com Canvas 2D — sem imagens.
 * Coordenadas da arena (y para baixo); (x, y) = pés.
 */

export type Pose = 'run' | 'rise' | 'fall' | 'glide' | 'dash' | 'dead' | 'idle';

export interface QuatiLook {
  pose: Pose;
  /** Fase da corrida (rad). */
  run: number;
  /** 0..1: amassado do pouso / toque. */
  squash: number;
  /** Ângulo do rabo girando (planar). */
  spin: number;
  /** Rotação do corpo (derrota, inclinação). */
  tilt: number;
}

export const QUATI = {
  body: '#c97a3c',
  bodyDark: '#8c4f22',
  belly: '#f2c890',
  stripe: '#4a2a14',
  mask: '#3a2214',
  nose: '#1d120b',
} as const;

/** Quadril (x) e fase de cada perna: duas da frente, duas de trás. */
const LEGS: ReadonlyArray<readonly [number, number]> = [
  [-9, 0],
  [9, Math.PI],
  [-6, Math.PI],
  [12, 0],
];

export function drawQuati(ctx: CanvasRenderingContext2D, x: number, y: number, o: QuatiLook): void {
  ctx.save();
  ctx.translate(x, y);
  const sq = o.squash;
  ctx.scale(1 + sq * 0.14, 1 - sq * 0.2);
  const bob = o.pose === 'run' ? -Math.abs(Math.sin(o.run)) * 2.2 : 0;
  ctx.translate(0, bob);
  if (o.tilt) {
    ctx.translate(0, -16);
    ctx.rotate(o.tilt);
    ctx.translate(0, 16);
  }

  // ── rabo (atrás do corpo) ──
  if (o.pose === 'glide') drawSpinTail(ctx, o.spin);
  else drawTail(ctx, o.pose);

  // ── pernas ──
  ctx.strokeStyle = QUATI.bodyDark;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4.2;
  for (let i = 0; i < LEGS.length; i++) {
    const [hx, ph] = LEGS[i];
    let ang = 0;
    let len = 10;
    if (o.pose === 'run' || o.pose === 'idle') ang = Math.sin(o.run + ph) * 0.85;
    else if (o.pose === 'rise') {
      ang = i % 2 === 0 ? -0.9 : 0.9;
      len = 7;
    } else if (o.pose === 'fall' || o.pose === 'glide') {
      ang = i % 2 === 0 ? 0.25 : -0.2;
      len = 10.5;
    } else if (o.pose === 'dash') {
      ang = i < 2 ? -1.2 : 1.1;
      len = 9;
    } else if (o.pose === 'dead') ang = i % 2 ? 1.4 : -1.4;
    if (i >= 2) ctx.globalAlpha = 0.75; // pernas do outro lado, mais escuras
    ctx.beginPath();
    ctx.moveTo(hx, -9);
    ctx.lineTo(hx + Math.sin(ang) * len, -9 + Math.cos(ang) * len);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── corpo ──
  ctx.fillStyle = QUATI.body;
  ctx.beginPath();
  ctx.ellipse(0, -17, 17.5, 10.5, o.pose === 'rise' ? -0.12 : o.pose === 'fall' ? 0.1 : 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = QUATI.belly;
  ctx.beginPath();
  ctx.ellipse(3, -11.5, 11, 4.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── cabeça ──
  ctx.fillStyle = QUATI.body;
  ctx.beginPath();
  ctx.arc(15, -23, 8.6, 0, Math.PI * 2);
  ctx.fill();
  // focinho comprido e nariz
  ctx.beginPath();
  ctx.moveTo(19, -27.5);
  ctx.quadraticCurveTo(29, -24, 31.5, -20.5);
  ctx.lineTo(20, -17);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = QUATI.belly;
  ctx.beginPath();
  ctx.moveTo(20, -18.5);
  ctx.quadraticCurveTo(26, -20, 31, -20.2);
  ctx.lineTo(21, -16.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = QUATI.nose;
  ctx.beginPath();
  ctx.arc(31.2, -21, 2.3, 0, Math.PI * 2);
  ctx.fill();
  // orelha
  ctx.fillStyle = QUATI.bodyDark;
  ctx.beginPath();
  ctx.arc(10.5, -30.5, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = QUATI.belly;
  ctx.beginPath();
  ctx.arc(10.8, -30.2, 1.6, 0, Math.PI * 2);
  ctx.fill();
  // máscara e olho
  ctx.fillStyle = QUATI.mask;
  ctx.beginPath();
  ctx.ellipse(18.5, -25, 4.6, 2.9, 0.25, 0, Math.PI * 2);
  ctx.fill();
  if (o.pose === 'dead') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(17, -27);
    ctx.lineTo(20, -23.5);
    ctx.moveTo(20, -27);
    ctx.lineTo(17, -23.5);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(19, -25.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(19.6, -25.4, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Rabo anelado (marrom com listras escuras), levantado em curva. */
function drawTail(ctx: CanvasRenderingContext2D, pose: Pose): void {
  // Ponta do rabo: mais para cima caindo, mais para trás subindo/no dash.
  const tx = pose === 'rise' ? -36 : pose === 'fall' ? -26 : pose === 'dash' ? -40 : -30;
  const ty = pose === 'rise' ? -14 : pose === 'fall' ? -48 : pose === 'dash' ? -20 : -44;
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = QUATI.body;
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.quadraticCurveTo(-30, -18, tx, ty);
  ctx.stroke();
  ctx.strokeStyle = QUATI.stripe;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(-14, -18);
  ctx.quadraticCurveTo(-30, -18, tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Planando: o rabo gira em cima como hélice (borrão + duas pás). */
function drawSpinTail(ctx: CanvasRenderingContext2D, spin: number): void {
  ctx.strokeStyle = QUATI.body;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -24);
  ctx.lineTo(-4, -40);
  ctx.stroke();
  ctx.fillStyle = 'rgba(201, 122, 60, 0.28)';
  ctx.beginPath();
  ctx.ellipse(-4, -42, 26, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const c = Math.cos(spin);
  ctx.strokeStyle = QUATI.stripe;
  ctx.lineWidth = 5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(-4 - 24 * c, -42);
  ctx.lineTo(-4 + 24 * c, -42);
  ctx.stroke();
  ctx.setLineDash([]);
}
