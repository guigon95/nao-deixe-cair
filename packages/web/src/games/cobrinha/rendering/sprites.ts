import type { ItemKind } from '../game/config';

/**
 * Ilustrações desenhadas em código (sem imagens de terceiros).
 * Todas centradas em (0, 0), num quadrado de lado ~1 (o chamador escala).
 */

type Ctx = CanvasRenderingContext2D;

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function outline(ctx: Ctx) {
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = 'rgba(20, 14, 30, 0.75)';
  ctx.stroke();
}

/** Texto em escala pequena: desenha com fonte grande e escala para baixo (Safari arredonda fontes minúsculas). */
function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.fillStyle = color;
  ctx.font = '900 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function bill(ctx: Ctx, x: number, y: number, w: number, h: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  rr(ctx, -w / 2, -h / 2, w, h, 0.04);
  ctx.fillStyle = '#6fd38a';
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = '#2e8b47';
  ctx.beginPath();
  ctx.ellipse(0, 0, h * 0.28, h * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, '$', 0, h * 0.03, h * 0.42, '#e9ffe9');
  ctx.restore();
}

export function drawItem(ctx: Ctx, kind: ItemKind, t: number) {
  switch (kind) {
    case 'chocolate': {
      // bombom embrulhado em papel dourado, com as "torcidas" dos lados
      ctx.fillStyle = '#ffcf4a';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 0.22, 0);
        ctx.lineTo(s * 0.5, -0.2);
        ctx.lineTo(s * 0.44, 0);
        ctx.lineTo(s * 0.5, 0.2);
        ctx.closePath();
        ctx.fill();
        outline(ctx);
      }
      ctx.beginPath();
      ctx.arc(0, 0, 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#7a3e1e';
      ctx.fill();
      outline(ctx);
      ctx.beginPath();
      ctx.arc(-0.08, -0.1, 0.09, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-0.18, 0.08);
      ctx.quadraticCurveTo(0, 0.2, 0.18, 0.08);
      ctx.stroke();
      break;
    }
    case 'dinheiro': {
      bill(ctx, 0.04, 0.12, 0.86, 0.46, 0.08);
      bill(ctx, -0.02, 0, 0.86, 0.46, -0.06);
      bill(ctx, 0, -0.12, 0.86, 0.46, 0.02);
      // cinta de papel do maço
      ctx.fillStyle = '#fff3c4';
      ctx.fillRect(-0.1, -0.36, 0.2, 0.46);
      break;
    }
    case 'ouro': {
      const shine = (Math.sin(t * 3) + 1) / 2;
      ctx.beginPath();
      ctx.moveTo(-0.46, 0.24);
      ctx.lineTo(-0.3, -0.2);
      ctx.lineTo(0.3, -0.2);
      ctx.lineTo(0.46, 0.24);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -0.2, 0, 0.24);
      g.addColorStop(0, '#fff2a8');
      g.addColorStop(0.5, '#ffcc33');
      g.addColorStop(1, '#c48a00');
      ctx.fillStyle = g;
      ctx.fill();
      outline(ctx);
      ctx.fillStyle = '#ffe680';
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.2);
      ctx.lineTo(0.3, -0.2);
      ctx.lineTo(0.22, -0.06);
      ctx.lineTo(-0.22, -0.06);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = shine * 0.9;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(-0.1 + shine * 0.3, -0.18);
      ctx.lineTo(-0.02 + shine * 0.3, -0.18);
      ctx.lineTo(-0.16 + shine * 0.3, 0.22);
      ctx.lineTo(-0.24 + shine * 0.3, 0.22);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'rachadinha': {
      // um maço que se divide em três: as notas se afastam e voltam
      const s = (Math.sin(t * 4) + 1) / 2;
      const spread = 0.04 + s * 0.16;
      bill(ctx, -spread * 1.2, 0.14, 0.5, 0.32, -0.35 - s * 0.2);
      bill(ctx, spread * 1.2, 0.14, 0.5, 0.32, 0.35 + s * 0.2);
      bill(ctx, 0, -0.1 - spread * 0.5, 0.56, 0.34, 0);
      // a "rachadura" no meio
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(0, -0.38);
      ctx.lineTo(-0.06, -0.24);
      ctx.lineTo(0.05, -0.14);
      ctx.lineTo(-0.03, 0.0);
      ctx.stroke();
      break;
    }
    case 'mansao': {
      // casarão com colunas e placa
      ctx.fillStyle = '#fff6ea';
      rr(ctx, -0.42, -0.08, 0.84, 0.44, 0.03);
      ctx.fill();
      outline(ctx);
      ctx.beginPath();
      ctx.moveTo(-0.5, -0.06);
      ctx.lineTo(0, -0.4);
      ctx.lineTo(0.5, -0.06);
      ctx.closePath();
      ctx.fillStyle = '#ff7eb6';
      ctx.fill();
      outline(ctx);
      ctx.fillStyle = '#d7c6b0';
      for (const x of [-0.3, -0.12, 0.12, 0.3]) ctx.fillRect(x - 0.03, -0.04, 0.06, 0.36);
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(-0.06, 0.12, 0.12, 0.24);
      // piscina
      ctx.fillStyle = '#5ad1ff';
      rr(ctx, 0.22, 0.34, 0.26, 0.1, 0.04);
      ctx.fill();
      // placa
      ctx.fillStyle = '#ffd23f';
      rr(ctx, -0.36, -0.62, 0.72, 0.2, 0.05);
      ctx.fill();
      outline(ctx);
      label(ctx, 'MANSÃO', 0, -0.515, 0.15, '#3a2400');
      break;
    }
    case 'jatinho': {
      ctx.save();
      ctx.rotate(-0.35 + Math.sin(t * 5) * 0.06);
      ctx.fillStyle = '#f4f7ff';
      rr(ctx, -0.46, -0.1, 0.9, 0.2, 0.1);
      ctx.fill();
      outline(ctx);
      ctx.fillStyle = '#3d7bd9';
      ctx.beginPath();
      ctx.moveTo(-0.06, 0);
      ctx.lineTo(-0.22, 0.38);
      ctx.lineTo(-0.06, 0.38);
      ctx.lineTo(0.14, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.06);
      ctx.lineTo(-0.46, -0.32);
      ctx.lineTo(-0.36, -0.32);
      ctx.lineTo(-0.2, -0.06);
      ctx.fill();
      ctx.fillStyle = '#7fd3ff';
      for (const x of [-0.12, 0.02, 0.16]) ctx.fillRect(x, -0.05, 0.07, 0.05);
      ctx.fillStyle = '#1b2a5e';
      ctx.beginPath();
      ctx.moveTo(0.3, -0.07);
      ctx.lineTo(0.42, -0.02);
      ctx.lineTo(0.3, 0.02);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'mala': {
      const bob = Math.sin(t * 6) * 0.03;
      ctx.translate(0, bob);
      ctx.strokeStyle = '#4a2a10';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.roundRect(-0.14, -0.4, 0.28, 0.18, 0.06);
      ctx.stroke();
      rr(ctx, -0.46, -0.26, 0.92, 0.62, 0.08);
      ctx.fillStyle = '#8b5a2b';
      ctx.fill();
      outline(ctx);
      // notas escapando pela tampa
      bill(ctx, -0.18, -0.26, 0.36, 0.2, -0.3);
      bill(ctx, 0.16, -0.27, 0.36, 0.2, 0.25);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-0.46, -0.02, 0.92, 0.07);
      label(ctx, '×2', 0, 0.2, 0.3, '#ffd23f');
      ctx.translate(0, -bob);
      break;
    }
  }
}

export interface HeadPose {
  /** Para onde os olhos olham (vetor de grade). */
  lookX: number;
  lookY: number;
  /** 0 = boca fechada (sorriso), 1 = bocão aberto. */
  mouth: number;
  dead: boolean;
  /** Bochechas infladas conforme cresce (0–1). */
  chubby: number;
  blink: boolean;
}

/**
 * Cabeça do Deputado Fominha: personagem FICTÍCIO e genérico (cabelo
 * engomadinho com topete, bochechas de quem come demais, sorrisão de
 * campanha). Não representa nenhuma pessoa real. Centrada em (0, 0), raio ~0.5.
 */
export function drawHead(ctx: Ctx, pose: HeadPose) {
  const c = 1 + pose.chubby * 0.12;
  // orelhas
  ctx.fillStyle = '#f2b48c';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 0.47 * c, 0.04, 0.09, 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
  }
  // rosto: largo embaixo (bochechas)
  ctx.beginPath();
  ctx.ellipse(0, 0.04, 0.46 * c, 0.48, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffc8a2';
  ctx.fill();
  outline(ctx);
  // cabelo engomado com topete e risca
  ctx.beginPath();
  ctx.moveTo(-0.44 * c, -0.02);
  ctx.quadraticCurveTo(-0.5 * c, -0.46, -0.06, -0.5);
  ctx.quadraticCurveTo(0.34, -0.62, 0.46 * c, -0.2);
  ctx.quadraticCurveTo(0.44 * c, -0.04, 0.4 * c, -0.02);
  ctx.quadraticCurveTo(0.3, -0.26, 0.02, -0.26);
  ctx.quadraticCurveTo(-0.28, -0.3, -0.44 * c, -0.02);
  ctx.closePath();
  ctx.fillStyle = '#2b2b3a';
  ctx.fill();
  outline(ctx);
  ctx.strokeStyle = '#8c8ca6';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(-0.12, -0.48);
  ctx.quadraticCurveTo(0.1, -0.42, 0.3, -0.42);
  ctx.stroke();
  // bochechas rosadas
  ctx.fillStyle = 'rgba(255, 110, 120, 0.45)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 0.28 * c, 0.16, 0.1 + pose.chubby * 0.03, 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // sobrancelhas grossas
  ctx.strokeStyle = '#2b2b3a';
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.08, -0.16 - (pose.dead ? 0 : 0.02));
    ctx.lineTo(s * 0.26, -0.2 + (pose.dead ? 0.04 : 0));
    ctx.stroke();
  }
  // olhos
  const lx = pose.lookX * 0.045;
  const ly = pose.lookY * 0.04;
  for (const s of [-1, 1]) {
    const ex = s * 0.16;
    const ey = -0.06;
    if (pose.dead) {
      ctx.strokeStyle = '#2b2b3a';
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(ex - 0.06, ey - 0.06);
      ctx.lineTo(ex + 0.06, ey + 0.06);
      ctx.moveTo(ex + 0.06, ey - 0.06);
      ctx.lineTo(ex - 0.06, ey + 0.06);
      ctx.stroke();
      continue;
    }
    if (pose.blink) {
      ctx.strokeStyle = '#2b2b3a';
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(ex - 0.07, ey);
      ctx.lineTo(ex + 0.07, ey);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 0.085, 0.095, 0, 0, Math.PI * 2);
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = '#1d1d2b';
    ctx.beginPath();
    ctx.arc(ex + lx, ey + ly, 0.042, 0, Math.PI * 2);
    ctx.fill();
  }
  // nariz de batata
  ctx.fillStyle = '#f2a07a';
  ctx.beginPath();
  ctx.ellipse(0, 0.06, 0.07, 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  // boca: sorrisão de campanha que vira bocão ao comer
  if (pose.dead) {
    ctx.strokeStyle = '#7a2a2a';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.14, 0.3);
    ctx.quadraticCurveTo(0, 0.2, 0.14, 0.3);
    ctx.stroke();
  } else {
    const open = pose.mouth;
    ctx.beginPath();
    ctx.moveTo(-0.2, 0.2);
    ctx.quadraticCurveTo(0, 0.3 + open * 0.2, 0.2, 0.2);
    ctx.quadraticCurveTo(0, 0.24 + open * 0.06, -0.2, 0.2);
    ctx.closePath();
    ctx.fillStyle = '#7a1e2e';
    ctx.fill();
    // dentes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-0.17, 0.205);
    ctx.quadraticCurveTo(0, 0.25 + open * 0.05, 0.17, 0.205);
    ctx.lineTo(0.15, 0.235 + open * 0.02);
    ctx.quadraticCurveTo(0, 0.27 + open * 0.06, -0.15, 0.235 + open * 0.02);
    ctx.closePath();
    ctx.fill();
  }
}
