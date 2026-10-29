/**
 * Clima: de vez em quando chove (no inverno, neva). Só visual e som — a
 * física não muda, então a chuva nunca torna um trecho injusto. No máximo
 * uma chuva por estação, sorteada por partida, sempre longe das trocas de
 * estação; a intensidade sobe e desce pela distância.
 */
import { SEASONS, type SeasonId } from './palette';

export const RAIN = {
  /** Chance de uma estação ter uma chuva (no inverno, nevasca). */
  chance: 0.5,
  /** Comprimento da chuva (m), entre min e max. */
  minLength: 220,
  maxLength: 340,
  /** Metros para a chuva chegar e para ir embora. */
  ramp: 60,
  /** Folga (m) entre a chuva e qualquer troca de estação — nunca muda de cenário chovendo. */
  margin: 60,
  /** Começo sempre seco (m). */
  dryStart: 150,
} as const;

function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Janela de chuva da estação `i` nesta partida (ou null): sorteada pelo
 * número da partida, sempre no miolo estável da estação — depois do fim da
 * transição anterior e antes do começo da próxima.
 */
export function rainWindow(i: number, runId: number): { start: number; end: number; season: SeasonId } | null {
  if (hash(i * 7.31 + runId * 3.17) >= RAIN.chance) return null;
  const base = i * SEASONS.length;
  const lo = Math.max(base + RAIN.margin, RAIN.dryStart);
  const hi = base + SEASONS.length - SEASONS.blend - RAIN.margin;
  const len = RAIN.minLength + hash(i * 2.13 + runId * 5.9) * (RAIN.maxLength - RAIN.minLength);
  const room = hi - lo - len;
  if (room < 0) return null;
  const start = lo + hash(i * 4.77 + runId * 1.3) * room;
  return { start, end: start + len, season: SEASONS.order[i % SEASONS.order.length] };
}

/** Intensidade da chuva (0..1) neste ponto: sobe e desce aos poucos dentro da janela. */
export function rainAt(meters: number, runId: number): number {
  if (meters < RAIN.dryStart) return 0;
  const w = rainWindow(Math.floor(meters / SEASONS.length), runId);
  if (!w || meters < w.start || meters > w.end) return 0;
  const k = Math.min(1, Math.min(meters - w.start, w.end - meters) / RAIN.ramp);
  return k * k * (3 - 2 * k);
}

/** Compatível com o uso antigo: este ponto tem chuva? */
export function isRainy(meters: number, runId: number): boolean {
  return rainAt(meters, runId) > 0;
}

export interface Drop {
  x: number;
  y: number;
  speed: number;
  len: number;
}

/** Estado visual da chuva (gotas em pool fixo, intensidade suavizada). */
export class Weather {
  /** 0 = seco, 1 = chuva forte. */
  rain = 0;
  /** Relâmpago (0..1), decai rápido. */
  lightning = 0;
  /** Verdadeiro no quadro em que caiu um raio (o som do trovão lê e zera). */
  thunder = false;
  /** Começou a chover neste quadro (faixa "CHUVA!"). */
  started = false;
  readonly drops: Drop[] = [];
  private target = 0;
  private nextBolt = 6;

  constructor() {
    for (let i = 0; i < 90; i++) this.drops.push({ x: Math.random() * 760 - 60, y: Math.random() * 400, speed: 600 + Math.random() * 300, len: 10 + Math.random() * 8 });
  }

  reset(): void {
    this.rain = this.target = this.lightning = 0;
    this.thunder = this.started = false;
    this.nextBolt = 6;
  }

  /** `intensity` vem de `rainAt` (pela distância); aqui só suaviza um pouco. */
  update(dt: number, intensity: number, reducedMotion: boolean): void {
    const was = this.target;
    this.target = Math.max(0, Math.min(1, intensity));
    this.started = this.target > 0 && was === 0;
    this.rain += (this.target - this.rain) * Math.min(1, dt * 4);
    if (this.target === 0 && this.rain < 0.01) this.rain = 0;
    this.lightning = Math.max(0, this.lightning - dt * 3);
    this.thunder = false;
    if (this.rain > 0.85) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 7 + Math.random() * 9;
        if (!reducedMotion) this.lightning = 1;
        this.thunder = true;
      }
    }
    if (this.rain <= 0) return;
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x -= d.speed * 0.28 * dt;
      if (d.y > 400) {
        d.y -= 440;
        d.x = Math.random() * 760 - 60;
      }
    }
  }
}
