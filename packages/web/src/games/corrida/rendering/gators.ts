import type { Engine } from '../game/Engine';
import { GameState } from '../game/types';

/**
 * O bote do jacaré: quando a capivara passa pulando por cima de um rio, o
 * jacaré daquele rio salta da água com a boca aberta e fecha logo ABAIXO
 * das patas dela — susto e drama, sem mudar a física (os padrões continuam
 * provados atravessáveis). Se a capivara cair no rio, aí sim ele a pega.
 *
 * Coordenadas de mundo (y para cima; a água fica em y = WATER_Y).
 */

export const WATER_Y = -24;

export const BOTE = {
  /** Duração do bote (sobe, fecha a boca no alto, volta para a água) (s). */
  duration: 0.55,
  /** Momento (fração) em que a boca fecha. */
  snapAt: 0.5,
  /** Altura máxima da boca acima da água (u). */
  maxReach: 130,
  /** Folga mínima entre a boca fechando e as patas (u): nunca encosta. */
  clearance: 12,
  /** Antecipação: mira onde a capivara vai estar no momento do "nhac" (s). */
  lead: 0.27,
  /** Rio estreito demais não tem jacaré (u). */
  minGap: 50,
} as const;

export interface Gator {
  /** Início do rio (x do fim da margem esquerda): identifica o jacaré. */
  key: number;
  /** x do bote (mundo). */
  x: number;
  /** Tempo desde o começo do bote (s). */
  t: number;
  /** Altura do bote (topo da boca, acima da água, u). */
  reach: number;
  /** 'bote' = susto por baixo; 'pega' = a capivara caiu no rio. */
  kind: 'bote' | 'pega';
  snapped: boolean;
}

export interface GatorEvents {
  /** Saiu da água (respingo). */
  emerge: Array<{ x: number }>;
  /** Fechou a boca: `gap` = distância até as patas (u). */
  snap: Array<{ x: number; y: number; gap: number; kind: 'bote' | 'pega' }>;
}

export class Gators {
  /** Botes em andamento (no máximo um por rio). */
  readonly active: Gator[] = [];
  /** Rios cujo jacaré já deu o bote nesta passagem. */
  private used = new Set<number>();
  readonly events: GatorEvents = { emerge: [], snap: [] };

  reset(): void {
    this.active.length = 0;
    this.used.clear();
  }

  /** A cada quadro (tempo de jogo). Preenche `events` para som e efeitos. */
  update(engine: Engine, dt: number): void {
    this.events.emerge.length = 0;
    this.events.snap.length = 0;
    const r = engine.runner;
    const ground = engine.track.level.ground;
    const playing = engine.state === GameState.PLAYING;

    // Caiu no rio: o jacaré dali pega a capivara.
    if (engine.state !== GameState.READY && engine.deathCause === 'river' && !this.active.some((g) => g.kind === 'pega')) {
      const key = gapKeyAt(ground, r.x);
      if (key !== null) {
        this.remove(key);
        this.active.push({ key, x: r.x, t: 0, reach: Math.max(20, r.y - WATER_Y + 18), kind: 'pega', snapped: false });
        this.used.add(key);
        this.events.emerge.push({ x: r.x });
      }
    }

    // Passando por cima de um rio (no ar, fora do cipó): bote por baixo.
    if (playing && !r.grounded && !r.swinging) {
      const g = gapAt(ground, r.x);
      if (g && g.x1 - g.x0 >= BOTE.minGap && !this.used.has(g.x0) && !engine.track.level.burrowAt(g.x0 + 1)) {
        this.used.add(g.x0);
        const v = engine.runSpeed;
        const x = Math.min(g.x1 - 14, Math.max(g.x0 + 14, r.x + v * BOTE.lead));
        // Altura: fecha logo abaixo de onde as patas vão estar (estimativa balística simples).
        const tPeak = BOTE.duration * BOTE.snapAt;
        const feet = r.y + r.vy * tPeak - 0.5 * 2800 * tPeak * tPeak;
        const reach = Math.min(BOTE.maxReach, Math.max(18, Math.max(r.y, feet) - BOTE.clearance - WATER_Y));
        this.active.push({ key: g.x0, x, t: 0, reach, kind: 'bote', snapped: false });
        this.events.emerge.push({ x });
      }
    }

    for (const gt of this.active) {
      gt.t += dt;
      if (!gt.snapped && gt.t >= BOTE.duration * BOTE.snapAt) {
        gt.snapped = true;
        const top = WATER_Y + gt.reach;
        this.events.snap.push({ x: gt.x, y: top, gap: r.y - top, kind: gt.kind });
      }
    }
    // Remove botes terminados (o "pega" fica até a próxima partida).
    for (let i = this.active.length - 1; i >= 0; i--) {
      const gt = this.active[i];
      if (gt.kind === 'bote' && gt.t >= BOTE.duration) this.active.splice(i, 1);
    }
    // Esquece rios que ficaram para trás.
    if (this.used.size > 32) for (const k of this.used) if (k < r.x - 1500) this.used.delete(k);
  }

  /** Bote em andamento neste rio (para o desenho), ou null. */
  find(key: number): Gator | null {
    for (const g of this.active) if (g.key === key) return g;
    return null;
  }

  private remove(key: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) if (this.active[i].key === key) this.active.splice(i, 1);
  }
}

/** Rio (vão entre dois trechos de chão) que contém x, ou null. */
export function gapAt(ground: ReadonlyArray<{ x0: number; x1: number }>, x: number): { x0: number; x1: number } | null {
  for (let i = 0; i + 1 < ground.length; i++) {
    const a = ground[i].x1;
    const b = ground[i + 1].x0;
    if (x > a && x < b) return { x0: a, x1: b };
    if (a > x) break;
  }
  return null;
}

function gapKeyAt(ground: ReadonlyArray<{ x0: number; x1: number }>, x: number): number | null {
  const g = gapAt(ground, x);
  return g ? g.x0 : null;
}

/**
 * Forma do bote no tempo: altura (0..1 do alcance) e abertura da boca (rad).
 * Sobe rápido de boca aberta, fecha de uma vez no alto e volta para a água.
 */
export function boteShape(g: Gator): { rise: number; open: number } {
  const u = Math.min(1, g.t / BOTE.duration);
  const s = BOTE.snapAt;
  if (g.kind === 'pega') {
    // Sobe e fica com a capivara na boca, afundando devagar.
    const rise = u < s ? Math.sin((u / s) * (Math.PI / 2)) : Math.max(0, 1 - (g.t - BOTE.duration * s) * 0.9);
    return { rise, open: u < s ? 0.9 * (u / s) : 0.05 };
  }
  const rise = u < s ? Math.sin((u / s) * (Math.PI / 2)) : Math.cos(((u - s) / (1 - s)) * (Math.PI / 2));
  const open = u < s * 0.85 ? 0.95 * Math.min(1, u / (s * 0.5)) : u < s ? 0.95 * (1 - (u - s * 0.85) / (s * 0.15)) : 0.04;
  return { rise, open: Math.max(0.04, open) };
}
