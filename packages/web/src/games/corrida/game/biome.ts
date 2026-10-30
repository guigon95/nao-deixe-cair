/**
 * Biomas do caminho, em METROS (independentes das estações e da hora do dia):
 * Mata Atlântica → Pantanal → Cerrado → Caatinga → Mata Atlântica…
 * Cada um vira o próximo aos poucos (`BIOMES.blend`). Mudam o cenário, as
 * cores do chão e da vegetação e quais trechos aparecem mais no gerador.
 */

export type BiomeId = 'mata' | 'pantanal' | 'cerrado' | 'caatinga';

export const BIOMES = {
  order: ['mata', 'pantanal', 'cerrado', 'caatinga'] as const satisfies readonly BiomeId[],
  /** Metros de cada bioma e da transição (no fim dele). */
  length: 2200,
  blend: 320,
  banner: { mata: 'MATA ATLÂNTICA', pantanal: 'PANTANAL', cerrado: 'CERRADO', caatinga: 'CAATINGA' } as Record<BiomeId, string>,
} as const;

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Bioma atual e a mistura para o próximo (0 = só o atual, 1 = já é o próximo). */
export function biomeAt(meters: number): { from: BiomeId; to: BiomeId; t: number } {
  const m = Math.max(0, meters);
  const n = BIOMES.order.length;
  const i = Math.floor(m / BIOMES.length);
  const into = m - i * BIOMES.length;
  const start = BIOMES.length - BIOMES.blend;
  return { from: BIOMES.order[i % n], to: BIOMES.order[(i + 1) % n], t: smooth((into - start) / BIOMES.blend) };
}

/** Bioma que "manda" (faixa de aviso, gerador de trechos). */
export function dominantBiome(meters: number): BiomeId {
  const b = biomeAt(meters);
  return b.t >= 0.5 ? b.to : b.from;
}

/** Peso (0..1) de cada bioma no ponto: soma 1. */
export function biomeWeights(meters: number): Record<BiomeId, number> {
  const b = biomeAt(meters);
  const w: Record<BiomeId, number> = { mata: 0, pantanal: 0, cerrado: 0, caatinga: 0 };
  w[b.from] += 1 - b.t;
  w[b.to] += b.t;
  return w;
}

/**
 * Tom de cada bioma por cima da paleta da estação (cor e quanto puxa):
 * Pantanal mais verde-azulado e úmido; Cerrado de capim amarelado e terra
 * vermelha; Caatinga seca, de capim palha e terra alaranjada.
 */
export const BIOME_TINT: Record<Exclude<BiomeId, 'mata'>, Partial<Record<'far' | 'mid' | 'midDark' | 'near' | 'grass' | 'grassEdge' | 'dirt' | 'dirtDark' | 'water' | 'waterLight', [string, number]>>> = {
  pantanal: {
    far: ['#7fb7a8', 0.35],
    mid: ['#3f8f6a', 0.25],
    near: ['#3d8a55', 0.25],
    grass: ['#4fb05a', 0.3],
    dirt: ['#6e5a3c', 0.4],
    dirtDark: ['#4f3f28', 0.4],
    water: ['#3a8fb0', 0.4],
  },
  cerrado: {
    far: ['#b9b27a', 0.45],
    mid: ['#7c8f3e', 0.4],
    midDark: ['#5c6b2c', 0.35],
    near: ['#9a9a3c', 0.45],
    grass: ['#b5b04a', 0.55],
    grassEdge: ['#d6cc6a', 0.5],
    dirt: ['#a8552e', 0.55],
    dirtDark: ['#7d3c1e', 0.55],
  },
  caatinga: {
    far: ['#c9a27a', 0.55],
    mid: ['#8c8a6a', 0.55],
    midDark: ['#6d6a50', 0.55],
    near: ['#a8956a', 0.6],
    grass: ['#c9b06a', 0.7],
    grassEdge: ['#e0cd8a', 0.65],
    dirt: ['#b5703e', 0.6],
    dirtDark: ['#8a4f26', 0.6],
    water: ['#5a8fa0', 0.3],
  },
};
