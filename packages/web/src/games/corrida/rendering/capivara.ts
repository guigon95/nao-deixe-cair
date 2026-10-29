/**
 * A capivara (personagem do jogo), desenhada com Canvas 2D — sem imagens.
 * Corpo de barril, cabeção quadrado de focinho rombudo, orelhinhas e sem
 * rabo, como a de verdade. Para planar, segura uma folha de bananeira.
 * Coordenadas da arena (y para baixo); (x, y) = pés.
 */

export type Pose = 'run' | 'rise' | 'fall' | 'glide' | 'dash' | 'dead' | 'idle';

export interface CapivaraLook {
  pose: Pose;
  /** Fase da corrida (rad). */
  run: number;
  /** 0..1: amassado do pouso / toque. */
  squash: number;
  /** Tempo (s), para o balanço da folha. */
  time: number;
  /** Rotação do corpo (derrota, inclinação). */
  tilt: number;
}

export const CAPIVARA = {
  body: '#9a6a40',
  bodyLight: '#b5865a',
  bodyDark: '#6e4826',
  snout: '#5a3a20',
  leaf: '#4caf50',
  leafDark: '#2e7d32',
} as const;

/** Quadril (x) e fase de cada perna: duas da frente, duas de trás. */
const LEGS: ReadonlyArray<readonly [number, number]> = [
  [-12, 0],
  [8, Math.PI],
  [-7, Math.PI],
  [13, 0],
];

export function drawCapivara(ctx: CanvasRenderingContext2D, x: number, y: number, o: CapivaraLook): void {
  ctx.save();
  ctx.translate(x, y);
  const sq = o.squash;
  ctx.scale(1 + sq * 0.12, 1 - sq * 0.18);
  const bob = o.pose === 'run' || o.pose === 'idle' ? -Math.abs(Math.sin(o.run)) * 1.8 : 0;
  ctx.translate(0, bob);
  if (o.tilt) {
    ctx.translate(0, -17);
    ctx.rotate(o.tilt);
    ctx.translate(0, 17);
  }

  if (o.pose === 'glide') drawLeaf(ctx, o.time);

  // ── pernas curtas e grossas ──
  ctx.strokeStyle = CAPIVARA.bodyDark;
  ctx.lineCap = 'round';
  ctx.lineWidth = 5.2;
  for (let i = 0; i < LEGS.length; i++) {
    const [hx, ph] = LEGS[i];
    let ang = 0;
    let len = 8;
    if (o.pose === 'run' || o.pose === 'idle') ang = Math.sin(o.run + ph) * 0.8;
    else if (o.pose === 'rise') {
      ang = i % 2 === 0 ? -0.8 : 0.8;
      len = 6;
    } else if (o.pose === 'fall' || o.pose === 'glide') {
      ang = i % 2 === 0 ? 0.2 : -0.2;
      len = 8.5;
    } else if (o.pose === 'dash') {
      ang = i < 2 ? -1.15 : 1.05;
      len = 7.5;
    } else if (o.pose === 'dead') ang = i % 2 ? 1.4 : -1.4;
    if (i >= 2) ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(hx, -9);
    ctx.lineTo(hx + Math.sin(ang) * len, -9 + Math.cos(ang) * len);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── corpo de barril (sem rabo) ──
  const lean = o.pose === 'rise' ? -0.1 : o.pose === 'fall' ? 0.08 : 0;
  ctx.fillStyle = CAPIVARA.body;
  ctx.beginPath();
  ctx.ellipse(-2, -18, 20, 12.5, lean, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CAPIVARA.bodyLight;
  ctx.beginPath();
  ctx.ellipse(-4, -24, 13, 4.5, lean, 0, Math.PI * 2);
  ctx.fill();
  // Pelo: alguns traços escuros nas costas.
  ctx.strokeStyle = CAPIVARA.bodyDark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-14, -26);
  ctx.lineTo(-11, -23);
  ctx.moveTo(-8, -29);
  ctx.lineTo(-5, -26);
  ctx.moveTo(-2, -29.5);
  ctx.lineTo(1, -26.5);
  ctx.stroke();

  // ── cabeção quadrado, focinho rombudo ──
  ctx.fillStyle = CAPIVARA.body;
  ctx.beginPath();
  ctx.moveTo(8, -33);
  ctx.lineTo(22, -33);
  ctx.quadraticCurveTo(31, -32, 31, -24);
  ctx.quadraticCurveTo(31, -16, 24, -16);
  ctx.lineTo(10, -14);
  ctx.quadraticCurveTo(5, -22, 8, -33);
  ctx.closePath();
  ctx.fill();
  // focinho mais escuro
  ctx.fillStyle = CAPIVARA.snout;
  ctx.beginPath();
  ctx.moveTo(25, -31);
  ctx.quadraticCurveTo(31, -30, 31, -24);
  ctx.quadraticCurveTo(31, -17, 25, -16.5);
  ctx.closePath();
  ctx.fill();
  // narina e boca
  ctx.fillStyle = '#2a1a0e';
  ctx.beginPath();
  ctx.ellipse(29, -26, 1.2, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a1a0e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(30, -20);
  ctx.lineTo(26, -19);
  ctx.stroke();
  // orelhinhas redondas no alto
  ctx.fillStyle = CAPIVARA.bodyDark;
  ctx.beginPath();
  ctx.arc(11, -34, 3.2, 0, Math.PI * 2);
  ctx.fill();
  // olho pequeno, alto na cabeça (cara de tranquila)
  if (o.pose === 'dead') {
    ctx.strokeStyle = '#1b120a';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(17, -30);
    ctx.lineTo(20, -27);
    ctx.moveTo(20, -30);
    ctx.lineTo(17, -27);
    ctx.stroke();
  } else if (o.pose === 'run' || o.pose === 'idle') {
    // olhinho meio fechado: a capivara de sempre, em paz
    ctx.strokeStyle = '#1b120a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(18.5, -28.8, 1.8, 0.15, Math.PI - 0.15);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1b120a';
    ctx.beginPath();
    ctx.arc(18.5, -28.5, 1.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(19.1, -29.1, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Planando: segura uma folha de bananeira por cima, que balança devagar. */
function drawLeaf(ctx: CanvasRenderingContext2D, time: number): void {
  const sway = Math.sin(time * 6) * 0.08;
  ctx.strokeStyle = CAPIVARA.leafDark;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8, -30);
  ctx.lineTo(2, -50);
  ctx.stroke();
  ctx.save();
  ctx.translate(2, -52);
  ctx.rotate(-0.12 + sway);
  ctx.fillStyle = CAPIVARA.leaf;
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // nervura e rasgos da folha
  ctx.strokeStyle = CAPIVARA.leafDark;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(30, 0);
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    ctx.moveTo(i * 8, 0);
    ctx.lineTo(i * 8 + 4, 7);
  }
  ctx.stroke();
  ctx.restore();
}
