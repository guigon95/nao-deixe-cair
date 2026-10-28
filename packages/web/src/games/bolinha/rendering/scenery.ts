import { ARENA, playfield, SCENERY, type SceneId } from '../game/config';

/**
 * Cenários da bolinha: paleta + decoração de fundo de cada um e a mistura
 * gradual entre eles conforme a pontuação. Tudo é fundo: a decoração fica
 * atrás das barreiras, com pouco contraste, e nunca colide com nada.
 */

export interface Palette {
  skyTop: string;
  skyBottom: string;
  /** Faixas de margem (topo/rodapé) — o HUD fica em cima delas. */
  band: string;
  bandLine: string;
  barrier: string;
  barrierDark: string;
  barrierEdge: string;
  /** Listras das barreiras. */
  stripe: string;
}

export const PALETTES: Record<SceneId, Palette> = {
  noite: {
    skyTop: '#101a3f',
    skyBottom: '#0b1026',
    band: '#121a3c',
    bandLine: '#4a5590',
    barrier: '#ff5577',
    barrierDark: '#b8264a',
    barrierEdge: '#ffd1dc',
    stripe: '#ffffff',
  },
  selva: {
    skyTop: '#3fb6dc',
    skyBottom: '#c9efc4',
    band: '#1d4a2a',
    bandLine: '#4f8a4a',
    // troncos/bambus: marrom com bordas verde-claras, bem destacados do céu
    barrier: '#9a5b2a',
    barrierDark: '#5e3517',
    barrierEdge: '#d9f59a',
    stripe: '#3a1f0b',
  },
};

/** Texto anunciado quando o cenário começa a chegar. */
export const SCENE_NAMES: Record<SceneId, string> = {
  noite: 'NOITE',
  selva: 'BEM-VINDO À SELVA!',
};

export interface SceneMix {
  from: SceneId;
  to: SceneId;
  /** 0 = só `from`, 1 = só `to`. */
  t: number;
}

/** Em que ponto da transição estamos para esta pontuação. */
export function sceneryAt(score: number): SceneMix {
  let current = SCENERY[0];
  for (let i = 1; i < SCENERY.length; i++) {
    const next = SCENERY[i];
    if (score < next.at) break;
    const t = next.over > 0 ? (score - next.at) / next.over : 1;
    if (t < 1) return { from: current.id, to: next.id, t: smooth(t) };
    current = next;
  }
  return { from: current.id, to: current.id, t: 0 };
}

/** Peso (0..1) de um cenário na mistura atual. */
export function weightOf(mix: SceneMix, id: SceneId): number {
  if (mix.from === id && mix.to === id) return 1;
  if (mix.from === id) return 1 - mix.t;
  if (mix.to === id) return mix.t;
  return 0;
}

export function blendPalette(mix: SceneMix): Palette {
  const a = PALETTES[mix.from];
  const b = PALETTES[mix.to];
  if (mix.t <= 0 || mix.from === mix.to) return a;
  const out = {} as Palette;
  for (const k of Object.keys(a) as (keyof Palette)[]) out[k] = mixHex(a[k], b[k], mix.t);
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  const v = (ch(16) << 16) | (ch(8) << 8) | ch(0);
  return `#${v.toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Decoração da selva (desenhada só quando o peso da selva > 0)
// ---------------------------------------------------------------------------

/** Repetição horizontal de cada camada (u). */
const TREE_TILE = 230;
const VINE_TILE = 170;
const HILL_TILE = 300;

/**
 * Selva: sol, morros, árvores ao longe, cipós com macaquinhos balançando e
 * copa de folhas na faixa de cima. `scroll` = distância percorrida (u),
 * `time` = relógio (s), `motion` = false com "menos movimento".
 */
export function drawJungle(ctx: CanvasRenderingContext2D, alpha: number, scroll: number, time: number, motion: boolean) {
  if (alpha <= 0.01) return;
  const { top, bottom } = playfield();
  ctx.save();
  ctx.globalAlpha = alpha;

  // Sol com raios suaves (parado, no alto à direita).
  const sx = ARENA.width - 72;
  const sy = top + 62;
  const rays = ctx.createRadialGradient(sx, sy, 8, sx, sy, 90);
  rays.addColorStop(0, 'rgba(255, 244, 170, 0.9)');
  rays.addColorStop(0.35, 'rgba(255, 230, 120, 0.35)');
  rays.addColorStop(1, 'rgba(255, 230, 120, 0)');
  ctx.fillStyle = rays;
  ctx.fillRect(sx - 90, sy - 90, 180, 180);
  ctx.fillStyle = '#fff1a6';
  ctx.beginPath();
  ctx.arc(sx, sy, 24, 0, Math.PI * 2);
  ctx.fill();

  // Morros ao longe (parallax lento).
  const hillOff = -((scroll * 0.12) % HILL_TILE);
  ctx.fillStyle = 'rgba(46, 125, 80, 0.45)';
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = hillOff - HILL_TILE; x <= ARENA.width + HILL_TILE; x += HILL_TILE) {
    ctx.quadraticCurveTo(x + HILL_TILE * 0.25, bottom - 120, x + HILL_TILE * 0.5, bottom - 60);
    ctx.quadraticCurveTo(x + HILL_TILE * 0.75, bottom - 10, x + HILL_TILE, bottom - 70);
  }
  ctx.lineTo(ARENA.width + HILL_TILE, bottom);
  ctx.closePath();
  ctx.fill();

  // Árvores (parallax médio), em tom apagado para não parecer obstáculo.
  const treeOff = -((scroll * 0.3) % TREE_TILE);
  for (let x = treeOff - TREE_TILE; x < ARENA.width + TREE_TILE; x += TREE_TILE) {
    drawPalm(ctx, x + 40, bottom, 150, time, motion);
    drawBush(ctx, x + 150, bottom);
  }

  // Cipós pendurados da copa, alguns com macaquinho (parallax médio).
  const vineOff = -((scroll * 0.3) % VINE_TILE);
  let k = Math.floor((scroll * 0.3) / VINE_TILE); // índice estável de cada cipó
  for (let x = vineOff - VINE_TILE; x < ARENA.width + VINE_TILE; x += VINE_TILE, k++) {
    const seed = hash(k);
    const len = 60 + (seed % 70);
    const swing = motion ? Math.sin(time * 1.6 + seed) * 0.12 : 0;
    const vx = x + 60 + (seed % 50);
    drawVine(ctx, vx, top, len, swing);
    if (k % 2 === 0) {
      // macaquinho pendurado na ponta do cipó
      const ex = vx + Math.sin(swing) * len;
      const ey = top + Math.cos(swing) * len;
      drawMonkey(ctx, ex, ey, swing, time, motion, true);
    }
  }
  // Um macaquinho sentado no chão, de vez em quando.
  const groundOff = -((scroll * 0.3) % (TREE_TILE * 2));
  for (let x = groundOff; x < ARENA.width + TREE_TILE * 2; x += TREE_TILE * 2) {
    drawMonkey(ctx, x + 110, bottom - 20, 0, time, motion, false);
  }

  ctx.restore();
}

/** Copa de folhas por cima da faixa superior (fica por trás do HUD). */
export function drawCanopy(ctx: CanvasRenderingContext2D, alpha: number, scroll: number) {
  if (alpha <= 0.01) return;
  const { top, bottom } = playfield();
  ctx.save();
  ctx.globalAlpha = alpha;
  const off = -((scroll * 0.5) % 36);
  ctx.fillStyle = '#2f7a3b';
  ctx.beginPath();
  for (let x = off - 36; x < ARENA.width + 36; x += 36) {
    ctx.moveTo(x, top - 4);
    ctx.ellipse(x + 18, top - 2, 22, 9, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = '#245f2e';
  ctx.beginPath();
  for (let x = off - 18; x < ARENA.width + 36; x += 36) {
    ctx.moveTo(x, top);
    ctx.ellipse(x + 18, top + 2, 16, 6, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  // grama no chão
  ctx.fillStyle = '#3d8f45';
  ctx.beginPath();
  for (let x = off - 36; x < ARENA.width + 36; x += 12) {
    ctx.moveTo(x, bottom + 2);
    ctx.lineTo(x + 4, bottom - 7);
    ctx.lineTo(x + 8, bottom + 2);
  }
  ctx.fill();
  ctx.restore();
}

function drawPalm(ctx: CanvasRenderingContext2D, x: number, groundY: number, h: number, time: number, motion: boolean) {
  // tronco levemente curvo
  ctx.strokeStyle = 'rgba(92, 64, 40, 0.55)';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.quadraticCurveTo(x + 18, groundY - h * 0.5, x + 8, groundY - h);
  ctx.stroke();
  // folhas
  const tx = x + 8;
  const ty = groundY - h;
  const sway = motion ? Math.sin(time * 1.1 + x * 0.01) * 0.06 : 0;
  ctx.fillStyle = 'rgba(38, 110, 58, 0.6)';
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + sway;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(26, 0, 30, 7, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawBush(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  ctx.fillStyle = 'rgba(40, 120, 60, 0.5)';
  ctx.beginPath();
  ctx.arc(x, groundY - 8, 16, Math.PI, 0);
  ctx.arc(x + 20, groundY - 10, 20, Math.PI, 0);
  ctx.arc(x + 42, groundY - 6, 13, Math.PI, 0);
  ctx.fill();
}

function drawVine(ctx: CanvasRenderingContext2D, x: number, topY: number, len: number, swing: number) {
  const ex = x + Math.sin(swing) * len;
  const ey = topY + Math.cos(swing) * len;
  ctx.strokeStyle = 'rgba(52, 110, 50, 0.6)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x, topY - 4);
  ctx.quadraticCurveTo(x + (ex - x) * 0.4 + 6, topY + len * 0.5, ex, ey);
  ctx.stroke();
  // folhinhas no cipó
  ctx.fillStyle = 'rgba(60, 140, 62, 0.65)';
  for (let i = 1; i <= 3; i++) {
    const f = i / 4;
    const lx = x + (ex - x) * f;
    const ly = topY + (ey - topY) * f;
    ctx.beginPath();
    ctx.ellipse(lx + (i % 2 ? 4 : -4), ly, 4.5, 2.2, i % 2 ? 0.6 : -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Macaquinho simpático (formas simples). `hanging` = pendurado pela mão. */
function drawMonkey(ctx: CanvasRenderingContext2D, x: number, y: number, swing: number, time: number, motion: boolean, hanging: boolean) {
  const fur = 'rgba(122, 78, 42, 0.85)';
  const face = 'rgba(232, 196, 150, 0.9)';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1.5, 1.5);
  if (hanging) ctx.rotate(-swing * 0.8);
  const bodyY = hanging ? 13 : 0;
  // braço até o cipó
  if (hanging) {
    ctx.strokeStyle = fur;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(1, bodyY - 4);
    ctx.stroke();
  }
  // rabo enrolado
  const wag = motion ? Math.sin(time * 3 + x) * 0.3 : 0;
  ctx.strokeStyle = fur;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-3, bodyY + 6);
  ctx.quadraticCurveTo(-14, bodyY + 10 + wag * 6, -12, bodyY - 1);
  ctx.arc(-9, bodyY - 1, 3, Math.PI, Math.PI * 2.2);
  ctx.stroke();
  // corpo
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, bodyY + 4, 6, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // cabeça e orelhas
  const hy = bodyY - 7;
  ctx.beginPath();
  ctx.arc(-6.5, hy, 2.6, 0, Math.PI * 2);
  ctx.arc(6.5, hy, 2.6, 0, Math.PI * 2);
  ctx.arc(0, hy, 6, 0, Math.PI * 2);
  ctx.fill();
  // rosto
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(0, hy + 1.2, 4.2, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 24, 12, 0.9)';
  ctx.fillRect(-2.2, hy - 0.2, 1.2, 1.4);
  ctx.fillRect(1, hy - 0.2, 1.2, 1.4);
  ctx.restore();
}

/** Inteiro pseudoaleatório estável por índice (para variar os cipós). */
function hash(n: number): number {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  return h % 1000;
}
