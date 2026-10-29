import { ARENA, DAY_CYCLE, playfield, SEASONS, type SeasonId } from '../game/config';

/**
 * Cenários da bolinha: estação do ano + hora do dia + chuva, misturados aos
 * poucos conforme a pontuação. Tudo é fundo: a decoração fica atrás das
 * barreiras, com pouco contraste, e nunca colide com nada.
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
  /** Listras/veios das barreiras. */
  stripe: string;
}

/** Paleta de cada estação, de dia. A hora do dia tinge o céu por cima. */
export const PALETTES: Record<SeasonId, Palette> = {
  verao: {
    skyTop: '#3fb6dc',
    skyBottom: '#c9efc4',
    band: '#1d4a2a',
    bandLine: '#4f8a4a',
    // troncos: marrom com bordas verde-claras, bem destacados do céu
    barrier: '#9a5b2a',
    barrierDark: '#5e3517',
    barrierEdge: '#d9f59a',
    stripe: '#3a1f0b',
  },
  outono: {
    skyTop: '#7fb0d6',
    skyBottom: '#f6dcb0',
    band: '#4a2a17',
    bandLine: '#a8683a',
    barrier: '#8b4a26',
    barrierDark: '#552a12',
    barrierEdge: '#ffb347',
    stripe: '#2e1608',
  },
  inverno: {
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
  primavera: {
    skyTop: '#6cc4f0',
    skyBottom: '#fbe3ef',
    band: '#25503a',
    bandLine: '#7cc08a',
    // tronco claro com bordas floridas
    barrier: '#b07a52',
    barrierDark: '#74482a',
    barrierEdge: '#ffc2dc',
    stripe: '#4a2a14',
  },
};

/** Texto anunciado quando a estação começa a chegar. */
export const SCENE_NAMES: Record<SeasonId, string> = {
  verao: 'VERÃO!',
  outono: 'OUTONO',
  inverno: 'CHEGOU O INVERNO!',
  primavera: 'PRIMAVERA!',
};

export interface SceneMix {
  from: SeasonId;
  to: SeasonId;
  /** 0 = só `from`, 1 = só `to`. */
  t: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Estação para esta pontuação. Cada estação dura `SEASONS.length` pontos; nos
 * últimos `SEASONS.blend` pontos ela vai virando a próxima. Em ciclo, para sempre.
 */
export function sceneryAt(score: number): SceneMix {
  const s = Math.max(0, score);
  const n = SEASONS.order.length;
  const i = Math.floor(s / SEASONS.length);
  const into = s - i * SEASONS.length;
  const from = SEASONS.order[i % n];
  const to = SEASONS.order[(i + 1) % n];
  const start = SEASONS.length - SEASONS.blend;
  if (into < start) return { from, to: from, t: 0 };
  return { from, to, t: smooth((into - start) / SEASONS.blend) };
}

/** Peso (0..1) de uma estação na mistura atual. */
export function weightOf(mix: SceneMix, id: SeasonId): number {
  if (mix.from === mix.to) return mix.from === id ? 1 : 0;
  if (mix.from === id) return 1 - mix.t;
  if (mix.to === id) return mix.t;
  return 0;
}

// ---------------------------------------------------------------------------
// Hora do dia
// ---------------------------------------------------------------------------

export interface DayState {
  /** 0..1 dentro do ciclo do dia. */
  phase: number;
  /** 0 = dia claro, 1 = noite fechada. */
  night: number;
  /** Quanto o céu da estação é trocado pelo céu da hora (0..1). */
  tint: number;
  skyTop: string;
  skyBottom: string;
  /** Nome da fase, para avisos ("ANOITECENDO…"). */
  label: 'dia' | 'entardecer' | 'noite' | 'amanhecer';
}

/** Quadros-chave do céu ao longo do dia (fase 0..1). */
const DAY_KEYS: { at: number; top: string; bottom: string; tint: number; night: number }[] = [
  { at: 0, top: '#3fb6dc', bottom: '#c9efc4', tint: 0, night: 0 },
  { at: 0.42, top: '#3fb6dc', bottom: '#c9efc4', tint: 0, night: 0 },
  { at: 0.52, top: '#ee8a63', bottom: '#ffd59e', tint: 0.85, night: 0.12 }, // pôr do sol
  { at: 0.6, top: '#0e1636', bottom: '#28366a', tint: 1, night: 1 }, // noite
  { at: 0.84, top: '#0e1636', bottom: '#28366a', tint: 1, night: 1 },
  { at: 0.92, top: '#7fa8e8', bottom: '#ffc9c2', tint: 0.7, night: 0.18 }, // amanhecer
  { at: 1, top: '#3fb6dc', bottom: '#c9efc4', tint: 0, night: 0 },
];

export function dayAt(score: number): DayState {
  const phase = (((Math.max(0, score) % DAY_CYCLE.length) + DAY_CYCLE.length) % DAY_CYCLE.length) / DAY_CYCLE.length;
  let k = 0;
  while (k < DAY_KEYS.length - 2 && phase >= DAY_KEYS[k + 1].at) k++;
  const a = DAY_KEYS[k];
  const b = DAY_KEYS[k + 1];
  const t = smooth(b.at > a.at ? (phase - a.at) / (b.at - a.at) : 0);
  const label = phase < 0.42 ? 'dia' : phase < 0.56 ? 'entardecer' : phase < 0.86 ? 'noite' : phase < 0.97 ? 'amanhecer' : 'dia';
  return {
    phase,
    night: a.night + (b.night - a.night) * t,
    tint: a.tint + (b.tint - a.tint) * t,
    skyTop: mixHex(a.top, b.top, t),
    skyBottom: mixHex(a.bottom, b.bottom, t),
    label,
  };
}

/** Paleta final: estação (misturada) + céu da hora + escurecer à noite. */
export function blendPalette(mix: SceneMix, day?: DayState): Palette {
  const a = PALETTES[mix.from];
  const b = PALETTES[mix.to];
  let out: Palette;
  if (mix.t <= 0 || mix.from === mix.to) out = a;
  else {
    out = {} as Palette;
    for (const k of Object.keys(a) as (keyof Palette)[]) out[k] = mixHex(a[k], b[k], mix.t);
  }
  if (!day || (day.tint <= 0 && day.night <= 0)) return out;
  const dark = '#0a0f26';
  return {
    ...out,
    skyTop: mixHex(out.skyTop, day.skyTop, day.tint),
    skyBottom: mixHex(out.skyBottom, day.skyBottom, day.tint),
    band: mixHex(out.band, dark, day.night * 0.35),
    // barreiras escurecem pouco: continuam fáceis de ler à noite
    barrier: mixHex(out.barrier, dark, day.night * 0.18),
    barrierDark: mixHex(out.barrierDark, dark, day.night * 0.18),
  };
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  const v = (ch(16) << 16) | (ch(8) << 8) | ch(0);
  return `#${v.toString(16).padStart(6, '0')}`;
}

/** Céu claro (contorno na bolinha, etc.): de dia sim, à noite não. */
export function daylightOf(day: DayState): number {
  return 1 - day.night;
}

/**
 * Sol e lua. O sol desce e fica alaranjado no entardecer; a lua sobe à
 * noite. Parados no lugar (o "mundo" anda, o céu não).
 */
export function drawSky(ctx: CanvasRenderingContext2D, day: DayState) {
  const { top, bottom } = playfield();
  // sol: alto de dia, desce até o horizonte entre 0,42 e 0,58 da fase
  const set = Math.min(1, Math.max(0, (day.phase - 0.4) / 0.18));
  const rise = Math.min(1, Math.max(0, (day.phase - 0.88) / 0.12));
  const sunUp = day.phase < 0.6 ? 1 - set : rise;
  if (sunUp > 0.01) {
    const sx = ARENA.width - 72;
    const sy = top + 62 + (1 - sunUp) * (bottom - top - 140);
    const warm = day.label === 'entardecer' || day.label === 'amanhecer' ? 1 : 0;
    ctx.save();
    ctx.globalAlpha = Math.min(1, sunUp * 1.4);
    const rays = ctx.createRadialGradient(sx, sy, 8, sx, sy, 90);
    rays.addColorStop(0, warm ? 'rgba(255, 190, 110, 0.9)' : 'rgba(255, 244, 170, 0.9)');
    rays.addColorStop(0.35, warm ? 'rgba(255, 150, 80, 0.35)' : 'rgba(255, 230, 120, 0.35)');
    rays.addColorStop(1, 'rgba(255, 230, 120, 0)');
    ctx.fillStyle = rays;
    ctx.fillRect(sx - 90, sy - 90, 180, 180);
    ctx.fillStyle = warm ? '#ffc27a' : '#fff1a6';
    ctx.beginPath();
    ctx.arc(sx, sy, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (day.night > 0.05) {
    // lua cheia com crateras, no alto à esquerda
    const mx = 92;
    const my = top + 70;
    ctx.save();
    ctx.globalAlpha = day.night;
    const glow = ctx.createRadialGradient(mx, my, 6, mx, my, 60);
    glow.addColorStop(0, 'rgba(220, 230, 255, 0.45)');
    glow.addColorStop(1, 'rgba(220, 230, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 60, my - 60, 120, 120);
    ctx.fillStyle = '#eef3ff';
    ctx.beginPath();
    ctx.arc(mx, my, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(170, 182, 210, 0.55)';
    ctx.beginPath();
    ctx.arc(mx - 6, my - 4, 4, 0, Math.PI * 2);
    ctx.arc(mx + 5, my + 6, 3, 0, Math.PI * 2);
    ctx.arc(mx + 6, my - 7, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Escurece a decoração à noite (antes das barreiras, que ficam legíveis). */
export function drawNightShade(ctx: CanvasRenderingContext2D, day: DayState) {
  if (day.night <= 0.01) return;
  ctx.fillStyle = `rgba(8, 12, 35, ${(0.42 * day.night).toFixed(3)})`;
  ctx.fillRect(0, 0, ARENA.width, ARENA.height);
}

/** Vaga-lumes nas noites de verão e primavera. */
export function drawFireflies(ctx: CanvasRenderingContext2D, amount: number, time: number, motion: boolean) {
  if (amount <= 0.02) return;
  const { top, bottom } = playfield();
  ctx.fillStyle = '#fff6a0';
  for (let i = 0; i < 16; i++) {
    const h1 = frac(Math.sin(i * 12.99) * 4375.5);
    const h2 = frac(Math.sin(i * 78.23) * 9631.7);
    const x = (h1 * ARENA.width - (motion ? time * 12 * (0.5 + h2) : 0)) % ARENA.width;
    const y = top + 40 + h2 * (bottom - top - 80) + (motion ? Math.sin(time + i) * 8 : 0);
    ctx.globalAlpha = amount * (0.3 + 0.7 * Math.abs(Math.sin(time * 2 + i * 1.7)));
    ctx.beginPath();
    ctx.arc(x < 0 ? x + ARENA.width : x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function frac(x: number) {
  return x - Math.floor(x);
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
export function drawSnow(ctx: CanvasRenderingContext2D, alpha: number, scroll: number, time: number, motion: boolean, storm = 0) {
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
    // nevasca (chuva no inverno): flocos mais rápidos, mais vento e mais visíveis
    const fall = motion ? time * 28 * f.z * (1 + storm * 1.6) : 0;
    const drift = motion ? Math.sin(time * 1.3 + f.phase) * 6 - time * 30 * storm * f.z : 0;
    let x = (f.x - scroll * 0.35 * f.z + drift) % ARENA.width;
    if (x < 0) x += ARENA.width;
    let y = (f.y + fall) % span;
    if (y < 0) y += span;
    ctx.globalAlpha = alpha * Math.min(1, (0.35 + 0.45 * f.z) * (1 + storm * 0.6));
    ctx.beginPath();
    ctx.arc(x, top + y, (0.8 + f.z * 1.6) * (1 + storm * 0.3), 0, Math.PI * 2);
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

// ---------------------------------------------------------------------------
// Outono e primavera (árvores de copa redonda, folhas/pétalas caindo)
// ---------------------------------------------------------------------------

const ROUND_TILE = 190;
const FALLERS = 40;
const fallers = Array.from({ length: FALLERS }, (_, i) => ({
  x: frac(Math.sin(i * 41.3) * 9973.1) * ARENA.width,
  y: frac(Math.sin(i * 17.9) * 7919.3) * ARENA.height,
  z: 0.4 + frac(Math.sin(i * 5.7) * 6151.9) * 0.6,
  phase: frac(Math.sin(i * 3.3) * 4421.7) * Math.PI * 2,
}));

/** Morros suaves + árvores de copa redonda + coisas caindo (folhas ou pétalas). */
function drawRoundTreeScene(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  scroll: number,
  time: number,
  motion: boolean,
  look: { hill: string; trunk: string; crowns: string[]; fall: string[]; fallShape: 'leaf' | 'petal' },
) {
  const { top, bottom } = playfield();
  ctx.save();
  ctx.globalAlpha = alpha;
  // morros
  const hillOff = -((scroll * 0.12) % HILL_TILE);
  ctx.fillStyle = look.hill;
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = hillOff - HILL_TILE; x <= ARENA.width + HILL_TILE; x += HILL_TILE) {
    ctx.quadraticCurveTo(x + HILL_TILE * 0.25, bottom - 110, x + HILL_TILE * 0.5, bottom - 55);
    ctx.quadraticCurveTo(x + HILL_TILE * 0.75, bottom - 5, x + HILL_TILE, bottom - 65);
  }
  ctx.lineTo(ARENA.width + HILL_TILE, bottom);
  ctx.closePath();
  ctx.fill();
  // árvores (parallax médio), tons apagados para não parecerem obstáculos
  const off = -((scroll * 0.3) % ROUND_TILE);
  let k = Math.floor((scroll * 0.3) / ROUND_TILE);
  for (let x = off - ROUND_TILE; x < ARENA.width + ROUND_TILE; x += ROUND_TILE, k++) {
    const h = 95 + (hash(k) % 50);
    const tx = x + 50 + (hash(k + 7) % 60);
    ctx.strokeStyle = look.trunk;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx, bottom);
    ctx.lineTo(tx, bottom - h);
    ctx.moveTo(tx, bottom - h * 0.65);
    ctx.lineTo(tx + 14, bottom - h * 0.85);
    ctx.stroke();
    const sway = motion ? Math.sin(time * 1.2 + k) * 2 : 0;
    const blobs: [number, number, number][] = [
      [0, -h - 6, 30],
      [-24, -h + 10, 22],
      [24, -h + 8, 24],
      [-8, -h - 26, 20],
      [14, -h - 22, 19],
    ];
    blobs.forEach(([dx, dy, r], i) => {
      ctx.fillStyle = look.crowns[(i + k) % look.crowns.length];
      ctx.beginPath();
      ctx.arc(tx + dx + sway, bottom + dy, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // folhas/pétalas caindo, girando e balançando
  const span = bottom - top;
  for (let i = 0; i < fallers.length; i++) {
    const f = fallers[i];
    const fall = motion ? time * 22 * f.z : 0;
    const drift = motion ? Math.sin(time * 1.4 + f.phase) * 10 : 0;
    let x = (f.x - scroll * 0.4 * f.z + drift) % ARENA.width;
    if (x < 0) x += ARENA.width;
    let y = (f.y + fall) % span;
    if (y < 0) y += span;
    ctx.globalAlpha = alpha * (0.45 + 0.4 * f.z);
    ctx.fillStyle = look.fall[i % look.fall.length];
    ctx.save();
    ctx.translate(x, top + y);
    ctx.rotate((motion ? time * 2 : 0) + f.phase);
    ctx.beginPath();
    if (look.fallShape === 'leaf') ctx.ellipse(0, 0, 4.5 * f.z + 1.5, 2.2 * f.z + 1, 0, 0, Math.PI * 2);
    else ctx.ellipse(0, 0, 3 * f.z + 1.2, 2 * f.z + 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

export function drawAutumn(ctx: CanvasRenderingContext2D, alpha: number, scroll: number, time: number, motion: boolean) {
  if (alpha <= 0.01) return;
  drawRoundTreeScene(ctx, alpha, scroll, time, motion, {
    hill: 'rgba(196, 140, 80, 0.45)',
    trunk: 'rgba(92, 58, 34, 0.55)',
    crowns: ['rgba(222, 110, 40, 0.6)', 'rgba(232, 160, 50, 0.6)', 'rgba(190, 70, 40, 0.6)'],
    fall: ['#e2702b', '#f0a33a', '#c5482c', '#d98b2b'],
    fallShape: 'leaf',
  });
}

export function drawSpring(ctx: CanvasRenderingContext2D, alpha: number, scroll: number, time: number, motion: boolean, day: number) {
  if (alpha <= 0.01) return;
  drawRoundTreeScene(ctx, alpha, scroll, time, motion, {
    hill: 'rgba(110, 180, 110, 0.45)',
    trunk: 'rgba(110, 76, 52, 0.5)',
    crowns: ['rgba(255, 182, 210, 0.62)', 'rgba(255, 210, 228, 0.62)', 'rgba(244, 150, 190, 0.6)'],
    fall: ['#ffc2dc', '#ffe0ee', '#f7a8c8'],
    fallShape: 'petal',
  });
  // borboletas (de dia)
  if (day > 0.05) {
    const { top, bottom } = playfield();
    ctx.save();
    ctx.globalAlpha = alpha * day * 0.85;
    for (let i = 0; i < 4; i++) {
      const bx = (((i * 97 + 40 - scroll * 0.35) % (ARENA.width + 40)) + ARENA.width + 40) % (ARENA.width + 40) - 20;
      const by = top + 90 + i * ((bottom - top - 200) / 4) + (motion ? Math.sin(time * 2 + i) * 14 : 0);
      const flap = motion ? Math.abs(Math.sin(time * 12 + i)) : 0.7;
      ctx.fillStyle = ['#ffd23f', '#9fd8ff', '#ff9ec7', '#c4a3ff'][i];
      ctx.beginPath();
      ctx.ellipse(bx - 3, by, 4 * flap + 1, 3.2, -0.5, 0, Math.PI * 2);
      ctx.ellipse(bx + 3, by, 4 * flap + 1, 3.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Faixas do outono: folhas secas acumuladas no chão e na copa. */
export function drawAutumnBands(ctx: CanvasRenderingContext2D, alpha: number, scroll: number) {
  if (alpha <= 0.01) return;
  drawLeafyBands(ctx, alpha, scroll, ['#c4602a', '#e39a3c', '#9c3d22'], ['#b5542a', '#d9852f']);
}

/** Faixas da primavera: copa verde com flores e flores no chão. */
export function drawSpringBands(ctx: CanvasRenderingContext2D, alpha: number, scroll: number) {
  if (alpha <= 0.01) return;
  drawLeafyBands(ctx, alpha, scroll, ['#3f8f4f', '#4fa35d'], ['#ff9ec7', '#fff3a0', '#ffffff', '#c4a3ff']);
}

function drawLeafyBands(ctx: CanvasRenderingContext2D, alpha: number, scroll: number, top: string[], dots: string[]) {
  const { top: t, bottom: b } = playfield();
  ctx.save();
  ctx.globalAlpha = alpha;
  const off = -((scroll * 0.5) % 36);
  top.forEach((c, j) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    for (let x = off - 36 + j * 18; x < ARENA.width + 36; x += 36) {
      ctx.moveTo(x, t - 3);
      ctx.ellipse(x + 18, t - 2 + j * 3, 20 - j * 3, 8 - j, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  });
  // pontinhos no chão (folhas secas ou flores)
  for (let i = 0; i < 40; i++) {
    const x = (((i * 37.3 - scroll * 0.5) % (ARENA.width + 20)) + ARENA.width + 20) % (ARENA.width + 20) - 10;
    ctx.fillStyle = dots[i % dots.length];
    ctx.beginPath();
    ctx.arc(x, b + 3 + (i % 3) * 3, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
