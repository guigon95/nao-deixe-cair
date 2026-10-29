/**
 * Paletas dos trechos do percurso. A cor muda aos poucos com a distância
 * (sensação de progresso), mas os OBSTÁCULOS mantêm as mesmas cores em
 * qualquer trecho: pedra é sempre cinza, espinho sempre tem ponta vermelha.
 */

export interface Palette {
  name: string;
  skyTop: string;
  skyBottom: string;
  sun: string;
  /** 0 = sem estrelas, 1 = céu estrelado. */
  stars: number;
  /** 0 = sem vaga-lumes, 1 = muitos. */
  fireflies: number;
  /** 0 = clima normal, 1 = inverno (araucárias, geada, neve caindo). */
  winter: number;
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

export const PALETTES: readonly Palette[] = [
  {
    name: 'MATA',
    skyTop: '#5fc3f2',
    skyBottom: '#d8f3c9',
    sun: '#fff3b0',
    stars: 0,
    fireflies: 0,
    winter: 0,
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
  {
    name: 'ENTARDECER',
    skyTop: '#f08a5d',
    skyBottom: '#ffe0a3',
    sun: '#ffd27a',
    stars: 0,
    fireflies: 0.2,
    winter: 0,
    far: '#c98e78',
    mid: '#7f7a4f',
    midDark: '#626039',
    near: '#4b5a32',
    grass: '#6aa845',
    grassEdge: '#c5e06b',
    dirt: '#8a5432',
    dirtDark: '#683d22',
    water: '#3f79b0',
    waterLight: '#ffd7a0',
  },
  {
    // Inverno na serra (Sul do Brasil): araucárias, geada no chão, céu pálido e neve fininha.
    name: 'INVERNO NA SERRA',
    skyTop: '#8fb0d4',
    skyBottom: '#e6eef6',
    sun: '#fffbea',
    stars: 0,
    fireflies: 0,
    winter: 1,
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
  {
    name: 'NOITE NA MATA',
    skyTop: '#121a3f',
    skyBottom: '#33467f',
    sun: '#e8f0ff',
    stars: 1,
    fireflies: 1,
    winter: 0,
    far: '#2c3b6a',
    mid: '#22405a',
    midDark: '#1a3247',
    near: '#173a37',
    grass: '#3f8f52',
    grassEdge: '#7fd08a',
    dirt: '#5e432e',
    dirtDark: '#45301f',
    water: '#1f4f86',
    waterLight: '#9fc3ff',
  },
  {
    name: 'AMANHECER',
    skyTop: '#7fa8e8',
    skyBottom: '#ffc9c2',
    sun: '#fff0c8',
    stars: 0.15,
    fireflies: 0.1,
    winter: 0,
    far: '#a7b4d6',
    mid: '#5c8d73',
    midDark: '#46725a',
    near: '#33634a',
    grass: '#54ad4f',
    grassEdge: '#a6e57e',
    dirt: '#865834',
    dirtDark: '#664126',
    water: '#3a86c2',
    waterLight: '#ffd9e6',
  },
];

/** Metros de cada trecho e da transição entre eles. */
export const BIOME_LENGTH = 800;
export const BIOME_BLEND = 120;

export function biomeIndex(meters: number): number {
  return Math.floor(Math.max(0, meters) / BIOME_LENGTH) % PALETTES.length;
}

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

const cache = new Map<string, Palette>();

/** Paleta no ponto do percurso (mistura na transição). Resultado em cache: nada novo a cada quadro. */
export function paletteAt(meters: number): Palette {
  const m = Math.max(0, meters);
  const i = Math.floor(m / BIOME_LENGTH);
  const into = m - i * BIOME_LENGTH;
  const from = PALETTES[(i + PALETTES.length - 1) % PALETTES.length];
  const to = PALETTES[i % PALETTES.length];
  if (i === 0 || into >= BIOME_BLEND) return to;
  const q = Math.round((into / BIOME_BLEND) * 24);
  const key = `${i % PALETTES.length}:${q}`;
  let p = cache.get(key);
  if (!p) {
    const k = q / 24;
    const out = {
      ...to,
      stars: lerp(from.stars, to.stars, k),
      fireflies: lerp(from.fireflies, to.fireflies, k),
      winter: lerp(from.winter, to.winter, k),
    } as Palette;
    for (const key2 of KEYS) (out as unknown as Record<string, string>)[key2] = mix(from[key2], to[key2], k);
    p = out;
    cache.set(key, p);
  }
  return p;
}

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

export function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - k) + ((pb >> 16) & 255) * k);
  const g = Math.round(((pa >> 8) & 255) * (1 - k) + ((pb >> 8) & 255) * k);
  const bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}
