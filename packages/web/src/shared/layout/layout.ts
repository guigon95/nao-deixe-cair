/** Arena lógica padrão do hub: 360 × 640 (9:16). Todos os jogos usam a mesma. */
export const ARENA_SIZE = { width: 360, height: 640 } as const;

export interface ArenaSize {
  width: number;
  height: number;
}

export interface Layout {
  /** Tamanho CSS da superfície. */
  cssWidth: number;
  cssHeight: number;
  /** Pixels CSS por unidade lógica (uniforme: nunca estica). */
  scale: number;
  /** Canto superior esquerdo da arena, em pixels CSS. */
  offsetX: number;
  offsetY: number;
  /** Proporção largura/altura da superfície. */
  aspect: number;
  /** Superfície muito mais larga que alta (celular deitado). */
  landscape: boolean;
}

/**
 * Encaixa a arena 360×640 na superfície disponível mantendo a proporção
 * (letterbox). O que sobra nas laterais/topo vira moldura decorativa.
 */
export function computeLayout(cssWidth: number, cssHeight: number, ARENA: ArenaSize = ARENA_SIZE): Layout {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  const scale = Math.min(w / ARENA.width, h / ARENA.height);
  const arenaW = ARENA.width * scale;
  const arenaH = ARENA.height * scale;
  return {
    cssWidth: w,
    cssHeight: h,
    scale,
    offsetX: (w - arenaW) / 2,
    offsetY: (h - arenaH) / 2,
    aspect: w / h,
    landscape: w / h > 1.15,
  };
}

/** devicePixelRatio limitado: acima de ~2,5 o custo de preenchimento cresce sem ganho visível. */
export function effectiveDpr(raw: number | undefined, max = 2.5): number {
  const d = raw && Number.isFinite(raw) && raw > 0 ? raw : 1;
  return Math.min(d, max);
}

/** Converte coordenada de tela (CSS px, relativa à superfície) em unidade lógica da arena. */
export function screenToArena(layout: Layout, x: number, y: number) {
  return { x: (x - layout.offsetX) / layout.scale, y: (y - layout.offsetY) / layout.scale };
}
