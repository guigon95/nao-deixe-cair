/**
 * Clima: de vez em quando chove. Só visual e som — a física não muda, então
 * a chuva nunca torna um trecho injusto. A agenda é determinística por
 * partida (trechos de `RAIN.segment` metros, sorteados pelo número da
 * partida), e a intensidade sobe e desce aos poucos.
 */
export const RAIN = {
  /** Metros de cada trecho de clima. */
  segment: 450,
  /** Chance de um trecho ser chuvoso. */
  chance: 0.3,
  /** Começo sempre seco (m). */
  dryStart: 150,
  /** Tempo para a chuva chegar/ir embora (s). */
  fade: 2.5,
} as const;

function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Este trecho da partida está chovendo? */
export function isRainy(meters: number, runId: number): boolean {
  if (meters < RAIN.dryStart) return false;
  const seg = Math.floor(meters / RAIN.segment);
  return hash(seg * 7.31 + runId * 3.17) < RAIN.chance;
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

  update(dt: number, raining: boolean, reducedMotion: boolean): void {
    const was = this.target;
    this.target = raining ? 1 : 0;
    this.started = this.target === 1 && was === 0;
    const step = dt / RAIN.fade;
    this.rain = this.target > this.rain ? Math.min(this.target, this.rain + step) : Math.max(this.target, this.rain - step);
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
