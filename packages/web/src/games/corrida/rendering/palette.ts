/**
 * Cenário da Disparada em camadas independentes, todas medidas em METROS:
 * - estações na ordem real: verão → outono → inverno → primavera → verão…
 *   cada uma vira a próxima AOS POUCOS, numa transição longa (`SEASONS.blend`);
 * - hora do dia em ciclo: dia → entardecer → noite → amanhecer → dia…
 * A chuva (weather.ts) só cai no miolo de uma estação, nunca numa transição.
 *
 * É só visual: os OBSTÁCULOS mantêm as mesmas cores em qualquer cenário
 * (pedra cinza, espinho com ponta vermelha, capim verde com contorno).
 */

import { BIOME_TINT, biomeAt } from '../game/biome';

export type SeasonId = 'verao' | 'outono' | 'inverno' | 'primavera';

export const SEASONS = {
  order: ['verao', 'outono', 'inverno', 'primavera'] as const satisfies readonly SeasonId[],
  /** Metros de cada estação. */
  length: 900,
  /** Metros da transição para a próxima (no fim da estação): lenta, ~7–10 s de corrida. */
  blend: 300,
  /** Faixas que aparecem quando a estação chega. */
  banner: { verao: 'VERÃO', outono: 'OUTONO', inverno: 'CHEGOU O INVERNO!', primavera: 'PRIMAVERA!' } as Record<SeasonId, string>,
} as const;

export const DAY = {
  /** Metros de um dia completo (dia → entardecer → noite → amanhecer). */
  length: 6000,
} as const;

export interface Palette {
  skyTop: string;
  skyBottom: string;
  sun: string;
  /** 0 = sem estrelas, 1 = céu estrelado. */
  stars: number;
  /** 0 = sem vaga-lumes, 1 = muitos. */
  fireflies: number;
  /** 0..1: inverno (araucárias aparecendo, geada, neve fininha). */
  winter: number;
  /** 0..1: outono (folhas caindo). */
  autumn: number;
  /** 0..1: primavera (ipês floridos). */
  spring: number;
  far: string;
  mid: string;
  midDark: string;
  near: string;
  grass: string;
  grassEdge: string;
  dirt: string;
  dirtDark: string;
  water: string;
  waterLight: string;
}

type Colors = Pick<
  Palette,
  'skyTop' | 'skyBottom' | 'sun' | 'far' | 'mid' | 'midDark' | 'near' | 'grass' | 'grassEdge' | 'dirt' | 'dirtDark' | 'water' | 'waterLight'
>;

const KEYS = [
  'skyTop',
  'skyBottom',
  'sun',
  'far',
  'mid',
  'midDark',
  'near',
  'grass',
  'grassEdge',
  'dirt',
  'dirtDark',
  'water',
  'waterLight',
] as const;

/** Cores de cada estação (de dia). */
export const SEASON_COLORS: Record<SeasonId, Colors> = {
  verao: {
    skyTop: '#5fc3f2',
    skyBottom: '#d8f3c9',
    sun: '#fff3b0',
    far: '#8cc9a0',
    mid: '#4f9a63',
    midDark: '#3c7d4e',
    near: '#2f6e43',
    grass: '#58b548',
    grassEdge: '#9be36b',
    dirt: '#8a5a33',
    dirtDark: '#6a4224',
    water: '#2f86c6',
    waterLight: '#9fdcff',
  },
  outono: {
    skyTop: '#7fb6dc',
    skyBottom: '#f3e2c0',
    sun: '#ffe2a0',
    far: '#c9b48a',
    mid: '#c0802e',
    midDark: '#8f5a24',
    near: '#7a5a2a',
    grass: '#a9a03e',
    grassEdge: '#d8c66a',
    dirt: '#87562f',
    dirtDark: '#663f22',
    water: '#3a7fb4',
    waterLight: '#cfe6f4',
  },
  inverno: {
    skyTop: '#8fb0d4',
    skyBottom: '#e6eef6',
    sun: '#fffbea',
    far: '#c3d1e0',
    mid: '#4a6f5c',
    midDark: '#365648',
    near: '#dde7ee',
    grass: '#eef3f8',
    grassEdge: '#ffffff',
    dirt: '#7a5c46',
    dirtDark: '#5b4332',
    water: '#8fc0dc',
    waterLight: '#f4fbff',
  },
  primavera: {
    skyTop: '#6cc6f0',
    skyBottom: '#f4f7d6',
    sun: '#fff6c4',
    far: '#9fd3a8',
    mid: '#5aa868',
    midDark: '#3f8a52',
    near: '#3a7d48',
    grass: '#62bd4f',
    grassEdge: '#b4ec7a',
    dirt: '#8a5a33',
    dirtDark: '#6a4224',
    water: '#2f8cc8',
    waterLight: '#bfe8ff',
  },
};

/** Hora do dia: céu próprio e quanto o resto da paisagem escurece/esquenta. */
interface DayPhase {
  skyTop: string;
  skyBottom: string;
  sun: string;
  /** Cor que tinge a paisagem e quanto (0..1). */
  tint: string;
  amount: number;
  stars: number;
  fireflies: number;
}

const DAY_PHASES: Record<'dia' | 'entardecer' | 'noite' | 'amanhecer', DayPhase | null> = {
  dia: null,
  entardecer: { skyTop: '#f08a5d', skyBottom: '#ffe0a3', sun: '#ffd27a', tint: '#c46a3a', amount: 0.18, stars: 0, fireflies: 0.2 },
  noite: { skyTop: '#121a3f', skyBottom: '#33467f', sun: '#e8f0ff', tint: '#141c3a', amount: 0.5, stars: 1, fireflies: 1 },
  amanhecer: { skyTop: '#7fa8e8', skyBottom: '#ffc9c2', sun: '#fff0c8', tint: '#d79a9a', amount: 0.1, stars: 0.15, fireflies: 0.1 },
};

/** Pontos-chave do ciclo do dia (fração do ciclo → fase). Entre eles, mistura suave. */
const DAY_KEYS: ReadonlyArray<readonly [number, keyof typeof DAY_PHASES]> = [
  [0, 'dia'],
  [0.36, 'dia'],
  [0.46, 'entardecer'],
  [0.56, 'noite'],
  [0.82, 'noite'],
  [0.91, 'amanhecer'],
  [1, 'dia'],
];

export function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Estação atual e a mistura para a próxima (0 = só a atual, 1 = já é a próxima). */
export function seasonAt(meters: number): { from: SeasonId; to: SeasonId; t: number; index: number } {
  const m = Math.max(0, meters);
  const n = SEASONS.order.length;
  const i = Math.floor(m / SEASONS.length);
  const into = m - i * SEASONS.length;
  const start = SEASONS.length - SEASONS.blend;
  return { from: SEASONS.order[i % n], to: SEASONS.order[(i + 1) % n], t: smooth((into - start) / SEASONS.blend), index: i };
}

/** Estação que "manda" na tela (para a faixa de aviso). */
export function dominantSeason(meters: number): SeasonId {
  const s = seasonAt(meters);
  return s.t >= 0.5 ? s.to : s.from;
}

/** Fase do dia: duas fases vizinhas e a mistura entre elas. */
export function dayAt(meters: number): { a: keyof typeof DAY_PHASES; b: keyof typeof DAY_PHASES; t: number } {
  const p = (((Math.max(0, meters) / DAY.length) % 1) + 1) % 1;
  for (let k = 0; k < DAY_KEYS.length - 1; k++) {
    const [p0, a] = DAY_KEYS[k];
    const [p1, b] = DAY_KEYS[k + 1];
    if (p >= p0 && p < p1) return { a, b, t: smooth((p - p0) / (p1 - p0)) };
  }
  return { a: 'dia', b: 'dia', t: 0 };
}

const cache = new Map<string, Palette>();

/**
 * Paleta no ponto do percurso. Quantizada (32 passos na estação, 48 no dia)
 * e guardada em cache: nada novo é criado a cada quadro.
 */
export function paletteAt(meters: number): Palette {
  const s = seasonAt(meters);
  const d = dayAt(meters);
  const bio = biomeAt(meters);
  const qs = Math.round(s.t * 32);
  const qd = Math.round(d.t * 48);
  const qb = Math.round(bio.t * 32);
  const key = `${s.from}>${s.to}:${qs}|${d.a}>${d.b}:${qd}|${bio.from}>${bio.to}:${qb}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const ks = qs / 32;
  const kd = qd / 48;
  const A = SEASON_COLORS[s.from];
  const B = SEASON_COLORS[s.to];
  const out = {} as Palette;
  for (const k of KEYS) out[k] = mix(A[k], B[k], ks);
  const w = (id: SeasonId) => (s.from === id ? 1 - ks : 0) + (s.to === id ? ks : 0);
  // Tom do bioma (antes da hora do dia, que escurece tudo por igual).
  const kb = qb / 32;
  for (const [id, wgt] of [
    [bio.from, 1 - kb],
    [bio.to, kb],
  ] as const) {
    if (id === 'mata' || wgt <= 0) continue;
    const tint = BIOME_TINT[id];
    for (const k of Object.keys(tint) as Array<keyof typeof tint>) {
      const [c, amt] = tint[k]!;
      out[k] = mix(out[k], c, amt * wgt);
    }
  }
  out.winter = w('inverno');
  out.autumn = w('outono');
  out.spring = w('primavera');
  // Hora do dia por cima da estação.
  const pa = DAY_PHASES[d.a];
  const pb = DAY_PHASES[d.b];
  const sky = (ph: DayPhase | null, base: Palette) => ph ?? { skyTop: base.skyTop, skyBottom: base.skyBottom, sun: base.sun, tint: '#000000', amount: 0, stars: 0, fireflies: 0 };
  const PA = sky(pa, out);
  const PB = sky(pb, out);
  // Fora do dia, o céu guarda um pouco da cor da estação (inverno mais pálido, verão mais vivo).
  out.skyTop = mix(mix(PA.skyTop, PB.skyTop, kd), out.skyTop, pa || pb ? 0.15 : 1);
  out.skyBottom = mix(mix(PA.skyBottom, PB.skyBottom, kd), out.skyBottom, pa || pb ? 0.15 : 1);
  out.sun = mix(PA.sun, PB.sun, kd);
  const amount = PA.amount * (1 - kd) + PB.amount * kd;
  const tint = mix(PA.amount > 0 ? PA.tint : PB.tint, PB.amount > 0 ? PB.tint : PA.tint, kd);
  for (const k of ['far', 'mid', 'midDark', 'near', 'grass', 'grassEdge', 'dirt', 'dirtDark', 'water', 'waterLight'] as const) {
    out[k] = mix(out[k], tint, amount);
  }
  out.stars = PA.stars * (1 - kd) + PB.stars * kd;
  // Sem vaga-lumes no frio.
  out.fireflies = (PA.fireflies * (1 - kd) + PB.fireflies * kd) * (1 - out.winter);
  if (cache.size > 4000) cache.clear();
  cache.set(key, out);
  return out;
}

export function mix(a: string, b: string, k: number): string {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
