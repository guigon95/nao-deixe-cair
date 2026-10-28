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
  neve: {
    skyTop: '#8fb4d8',
    skyBottom: '#e9f2fa',
    // faixas escuras (azul-ardósia) para o HUD branco continuar legível
    band: '#2c4361',
    bandLine: '#9fc0de',
    // blocos de gelo: azul com bordas de neve
    barrier: '#5b9bd1',
    barrierDark: '#2f6698',
    barrierEdge: '#ffffff',
    stripe: '#ffffff',
  },
};

/** Texto anunciado quando o cenário começa a chegar. */
export const SCENE_NAMES: Record<SceneId, string> = {
  noite: 'NOITE',
  selva: 'BEM-VINDO À SELVA!',
  neve: 'CHEGOU A NEVE!',
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

/** Peso de cenários com céu claro (contorno da bolinha, etc.). */
export function daylightOf(mix: SceneMix): number {
  return weightOf(mix, 'selva') + weightOf(mix, 'neve');
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

// ---------------------------------------------------------------------------
// Decoração da neve
// ---------------------------------------------------------------------------

const PEAK_TILE = 260;
const PINE_TILE = 150;
const FLAKES = 70;
/** Flocos fixos (posição base + profundidade); o movimento vem de scroll/tempo. */
const flakes = Array.from({ length: FLAKES }, (_, i) => {
  const h = (n: number) => ((Math.sin(n * 12.9898 + i * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: h(1) * ARENA.width, y: h(2) * ARENA.height, z: 0.35 + h(3) * 0.65, phase: h(4) * Math.PI * 2 };
});

/**
 * Neve: montanhas nevadas, pinheiros, pinguins e flocos caindo. Flocos são
 * pequenos e translúcidos (não parecem obstáculos); com "menos movimento"
 * eles ficam parados.
 */
export function drawSnow(ctx: CanvasRenderingContext2D, alpha: number, scroll: number, time: number, motion: boolean) {
  if (alpha <= 0.01) return;
  const { top, bottom } = playfield();
  ctx.save();
  ctx.globalAlpha = alpha;

  // Montanhas ao longe com pico nevado.
  const off = -((scroll * 0.1) % PEAK_TILE);
  for (let x = off - PEAK_TILE; x < ARENA.width + PEAK_TILE; x += PEAK_TILE) {
    const px = x + PEAK_TILE * 0.5;
    const py = bottom - 230;
    ctx.fillStyle = 'rgba(120, 150, 185, 0.55)';
    ctx.beginPath();
    ctx.moveTo(x - 20, bottom);
    ctx.lineTo(px, py);
    ctx.lineTo(x + PEAK_TILE + 20, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(px - 38, py + 52);
    ctx.lineTo(px, py);
    ctx.lineTo(px + 38, py + 52);
    ctx.lineTo(px + 18, py + 42);
    ctx.lineTo(px + 4, py + 56);
    ctx.lineTo(px - 14, py + 42);
    ctx.closePath();
    ctx.fill();
  }

  // Pinheiros nevados (parallax médio) e pinguins no chão.
  const pOff = -((scroll * 0.3) % PINE_TILE);
  let k = Math.floor((scroll * 0.3) / PINE_TILE);
  for (let x = pOff - PINE_TILE; x < ARENA.width + PINE_TILE; x += PINE_TILE, k++) {
    const h = 90 + (hash(k) % 60);
    drawPine(ctx, x + 40, bottom, h);
    if (k % 3 === 0) drawPenguin(ctx, x + 100, bottom - 2, time, motion);
  }

  // Neve no chão (montinhos).
  ctx.fillStyle = 'rgba(250, 252, 255, 0.95)';
  ctx.beginPath();
  const gOff = -((scroll * 0.5) % 60);
  ctx.moveTo(0, bottom + 4);
  for (let x = gOff - 60; x < ARENA.width + 60; x += 60) {
    ctx.quadraticCurveTo(x + 30, bottom - 12, x + 60, bottom - 2);
  }
  ctx.lineTo(ARENA.width, bottom + 4);
  ctx.closePath();
  ctx.fill();

  // Flocos caindo, com leve vento para a esquerda (acompanha a corrida).
  ctx.fillStyle = '#ffffff';
  const span = bottom - top;
  for (const f of flakes) {
    const fall = motion ? time * 28 * f.z : 0;
    const drift = motion ? Math.sin(time * 1.3 + f.phase) * 6 : 0;
    let x = (f.x - scroll * 0.35 * f.z + drift) % ARENA.width;
    if (x < 0) x += ARENA.width;
    let y = (f.y + fall) % span;
    if (y < 0) y += span;
    ctx.globalAlpha = alpha * (0.35 + 0.45 * f.z);
    ctx.beginPath();
    ctx.arc(x, top + y, 0.8 + f.z * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Neve acumulada nas faixas de cima e de baixo. */
export function drawSnowBands(ctx: CanvasRenderingContext2D, alpha: number, scroll: number) {
  if (alpha <= 0.01) return;
  const { top } = playfield();
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#f4f9ff';
  const off = -((scroll * 0.5) % 40);
  ctx.beginPath();
  ctx.moveTo(0, top - 6);
  for (let x = off - 40; x < ARENA.width + 40; x += 40) {
    ctx.quadraticCurveTo(x + 20, top + 6, x + 40, top - 4);
  }
  ctx.lineTo(ARENA.width, top - 8);
  ctx.lineTo(0, top - 8);
  ctx.closePath();
  ctx.fill();
  // pingentes de gelo
  ctx.fillStyle = 'rgba(220, 238, 255, 0.9)';
  ctx.beginPath();
  for (let x = off; x < ARENA.width + 40; x += 40) {
    ctx.moveTo(x + 8, top);
    ctx.lineTo(x + 11, top + 12);
    ctx.lineTo(x + 14, top);
    ctx.moveTo(x + 26, top);
    ctx.lineTo(x + 28, top + 8);
    ctx.lineTo(x + 30, top);
  }
  ctx.fill();
  ctx.restore();
}

function drawPine(ctx: CanvasRenderingContext2D, x: number, groundY: number, h: number) {
  ctx.fillStyle = 'rgba(90, 70, 55, 0.5)';
  ctx.fillRect(x - 4, groundY - 16, 8, 16);
  for (let i = 0; i < 3; i++) {
    const w = 34 - i * 8;
    const y0 = groundY - 14 - i * (h / 3.4);
    const y1 = y0 - h / 2.2;
    ctx.fillStyle = 'rgba(46, 96, 88, 0.55)';
    ctx.beginPath();
    ctx.moveTo(x - w, y0);
    ctx.lineTo(x, y1);
    ctx.lineTo(x + w, y0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.moveTo(x - w * 0.45, y1 + (y0 - y1) * 0.45);
    ctx.lineTo(x, y1);
    ctx.lineTo(x + w * 0.45, y1 + (y0 - y1) * 0.45);
    ctx.closePath();
    ctx.fill();
  }
}

/** Pinguim gordinho que balança de um lado para o outro. */
function drawPenguin(ctx: CanvasRenderingContext2D, x: number, groundY: number, time: number, motion: boolean) {
  ctx.save();
  ctx.translate(x, groundY);
  ctx.rotate(motion ? Math.sin(time * 4 + x) * 0.12 : 0);
  ctx.scale(1.4, 1.4);
  ctx.fillStyle = 'rgba(30, 38, 52, 0.9)';
  ctx.beginPath();
  ctx.ellipse(0, -11, 7, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(250, 250, 250, 0.95)';
  ctx.beginPath();
  ctx.ellipse(0, -9, 4.6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30, 38, 52, 0.9)';
  ctx.beginPath();
  ctx.arc(0, -20, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-2.6, -21.5, 1.6, 1.6);
  ctx.fillRect(1, -21.5, 1.6, 1.6);
  ctx.fillStyle = '#f2a33a';
  ctx.beginPath();
  ctx.moveTo(-1.6, -18.6);
  ctx.lineTo(1.6, -18.6);
  ctx.lineTo(0, -16.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-4.5, -1, 3.5, 1.5);
  ctx.fillRect(1, -1, 3.5, 1.5);
  ctx.restore();
}
