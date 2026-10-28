import type { SkinId, TrailId } from '../game/cosmetics';

/**
 * Desenho dos visuais da loja (bolinhas, rastros e moeda). Usado no jogo e
 * nas prévias da loja — o que se vê na loja é exatamente o que se joga.
 */

const TAU = Math.PI * 2;

/** Desenha a bolinha centrada na origem (o chamador já fez translate/escala). */
export function drawSkin(ctx: CanvasRenderingContext2D, id: SkinId, r: number, time = 0) {
  const circle = (fill: string | CanvasGradient) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
  };
  const shine = (alpha = 0.55) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.34, r * 0.3, 0, TAU);
    ctx.fill();
  };
  switch (id) {
    case 'basquete': {
      circle('#f08a24');
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.clip();
      ctx.strokeStyle = '#3a1a05';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.moveTo(-r * 0.75, -r);
      ctx.quadraticCurveTo(-r * 0.2, 0, -r * 0.75, r);
      ctx.moveTo(r * 0.75, -r);
      ctx.quadraticCurveTo(r * 0.2, 0, r * 0.75, r);
      ctx.stroke();
      ctx.restore();
      shine(0.25);
      break;
    }
    case 'sorriso': {
      circle('#ffd23f');
      ctx.fillStyle = '#4a2c00';
      ctx.beginPath();
      ctx.ellipse(-r * 0.35, -r * 0.2, r * 0.12, r * 0.2, 0, 0, TAU);
      ctx.ellipse(r * 0.35, -r * 0.2, r * 0.12, r * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#4a2c00';
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, r * 0.05, r * 0.52, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
      break;
    }
    case 'futebol': {
      circle('#f7f7f7');
      ctx.fillStyle = '#1d1d1d';
      polygon(ctx, 0, 0, r * 0.38, 5, -Math.PI / 2);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 5;
        polygon(ctx, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3, 5, a + Math.PI / 2);
      }
      ctx.strokeStyle = '#1d1d1d';
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'gelo': {
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, '#e9f8ff');
      g.addColorStop(1, '#6fc3f2');
      circle(g);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        ctx.lineTo(-Math.cos(a) * r * 0.7, -Math.sin(a) * r * 0.7);
      }
      ctx.stroke();
      shine(0.6);
      break;
    }
    case 'planeta': {
      // anel de trás, planeta, anel da frente
      ctx.strokeStyle = '#f5c46b';
      ctx.lineWidth = r * 0.18;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.55, r * 0.45, -0.35, Math.PI, TAU);
      ctx.stroke();
      circle('#8e6cf0');
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-r, -r * 0.25, r * 2, r * 0.2);
      ctx.fillRect(-r, r * 0.25, r * 2, r * 0.14);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.55, r * 0.45, -0.35, 0, Math.PI);
      ctx.stroke();
      shine(0.35);
      break;
    }
    case 'lava': {
      circle('#5c160b');
      const pulse = 0.65 + 0.35 * Math.sin(time * 6);
      ctx.strokeStyle = `rgba(255, ${Math.round(120 + 80 * pulse)}, 40, ${0.75 + 0.25 * pulse})`;
      ctx.lineWidth = r * 0.14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.3);
      ctx.lineTo(-r * 0.15, -r * 0.05);
      ctx.lineTo(r * 0.2, -r * 0.55);
      ctx.moveTo(-r * 0.15, -r * 0.05);
      ctx.lineTo(r * 0.1, r * 0.6);
      ctx.moveTo(r * 0.25, r * 0.15);
      ctx.lineTo(r * 0.75, r * 0.05);
      ctx.stroke();
      break;
    }
    default: {
      circle('#ffd23f');
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.3, r * 0.38, 0, TAU);
      ctx.fill();
    }
  }
}

/**
 * Um ponto do rastro. `t` = 1 (mais novo) → 0 (mais velho), `i` = índice,
 * `time` = relógio para animar cores.
 */
export function drawTrailDot(ctx: CanvasRenderingContext2D, id: TrailId, x: number, y: number, r: number, t: number, i: number, time: number) {
  switch (id) {
    case 'bolhas':
      ctx.globalAlpha = 0.55 * t;
      ctx.strokeStyle = '#bfe9ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y + Math.sin(i * 1.7 + time * 4) * 2, r * (0.3 + 0.5 * (1 - t)) + 1.5, 0, TAU);
      ctx.stroke();
      break;
    case 'arco-iris':
      ctx.globalAlpha = 0.5 * t;
      ctx.fillStyle = `hsl(${(i * 28 + time * 140) % 360}, 90%, 62%)`;
      ctx.beginPath();
      ctx.arc(x, y, r * (0.4 + 0.55 * t), 0, TAU);
      ctx.fill();
      break;
    case 'estrelas':
      ctx.globalAlpha = 0.75 * t;
      ctx.fillStyle = i % 2 ? '#fff4b8' : '#ffd23f';
      star(ctx, x, y, r * (0.25 + 0.45 * t), time * 3 + i);
      break;
    case 'fogo': {
      ctx.globalAlpha = 0.55 * t;
      const g = Math.round(60 + 150 * t);
      ctx.fillStyle = `rgb(255, ${g}, 30)`;
      ctx.beginPath();
      ctx.arc(x, y - (1 - t) * 6, r * (0.35 + 0.75 * (1 - t) * 0.6 + 0.3 * t), 0, TAU);
      ctx.fill();
      break;
    }
    default:
      ctx.globalAlpha = 0.28 * t;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(x, y, r * (0.35 + 0.55 * t), 0, TAU);
      ctx.fill();
  }
}

/** Moeda girando (achata no eixo X conforme o giro). */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  const w = Math.max(0.18, Math.abs(Math.cos(spin)));
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(255, 200, 60, 0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.8, 0, TAU);
  ctx.fill();
  ctx.scale(w, 1);
  ctx.fillStyle = '#b8860b';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffcc33';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff1a8';
  ctx.fillRect(-r * 0.14, -r * 0.45, r * 0.28, r * 0.9);
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i * TAU) / n;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}
