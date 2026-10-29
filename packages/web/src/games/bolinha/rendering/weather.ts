import { ARENA, playfield, RAIN } from '../game/config';

/**
 * Chuva de vez em quando. Só visual e som — a física não muda. A agenda é
 * determinística por partida (trechos de `RAIN.segment` pontos sorteados
 * pelo número da partida) e a intensidade sobe e desce aos poucos.
 */
function hash(n: number): number {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return s - Math.floor(s);
}

/** Este trecho da partida tem chuva? (no inverno, quem desenha é a nevasca) */
export function isRainy(score: number, runId: number): boolean {
  if (score < RAIN.dryStart) return false;
  const seg = Math.floor(score / RAIN.segment);
  return hash(seg * 7.31 + runId * 3.17) < RAIN.chance;
}

interface Drop {
  x: number;
  y: number;
  speed: number;
  len: number;
}

export class Weather {
  /** 0 = seco, 1 = chuva forte. */
  rain = 0;
  /** Relâmpago (0..1), decai rápido. */
  lightning = 0;
  /** Verdadeiro no quadro em que caiu um raio (o som do trovão lê). */
  thunder = false;
  /** Começou a chover neste quadro. */
  started = false;
  private readonly drops: Drop[] = [];
  private target = 0;
  private nextBolt = 8;

  constructor() {
    for (let i = 0; i < 80; i++) {
      this.drops.push({ x: Math.random() * (ARENA.width + 80) - 40, y: Math.random() * ARENA.height, speed: 520 + Math.random() * 260, len: 9 + Math.random() * 7 });
    }
  }

  reset(): void {
    this.rain = this.target = this.lightning = 0;
    this.thunder = this.started = false;
    this.nextBolt = 8;
  }

  update(dt: number, raining: boolean, reducedMotion: boolean): void {
    const was = this.target;
    this.target = raining ? 1 : 0;
    this.started = this.target === 1 && was === 0;
    const step = dt / RAIN.fade;
    this.rain = this.target > this.rain ? Math.min(1, this.rain + step) : Math.max(0, this.rain - step);
    this.lightning = Math.max(0, this.lightning - dt * 3);
    this.thunder = false;
    if (this.rain > 0.85) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 9 + Math.random() * 10;
        if (!reducedMotion) this.lightning = 1;
        this.thunder = true;
      }
    }
    if (this.rain <= 0 || reducedMotion) return;
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x -= d.speed * 0.25 * dt;
      if (d.y > ARENA.height) {
        d.y -= ARENA.height + 30;
        d.x = Math.random() * (ARENA.width + 80) - 40;
      }
    }
  }

  /** Nuvens carregadas no alto e céu mais escuro (antes da decoração). */
  drawClouds(ctx: CanvasRenderingContext2D, time: number): void {
    const k = this.rain;
    if (k <= 0.01) return;
    const { top } = playfield();
    ctx.fillStyle = `rgba(70, 82, 100, ${(0.45 * k).toFixed(3)})`;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? `rgba(110, 120, 138, ${(0.85 * k).toFixed(3)})` : `rgba(84, 94, 112, ${(0.9 * k).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const x = ((i * 83 + layer * 41 + time * (5 + layer * 3)) % (ARENA.width + 160)) - 80;
        const y = top + 18 + layer * 18 + hash(i * 3.7 + layer) * 20;
        const r = 30 + hash(i * 5.1 + layer) * 22;
        ctx.moveTo(x + r * 1.7, y);
        ctx.ellipse(x, y, r * 1.7, r * 0.6, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  /** Gotas inclinadas e relâmpago (por cima das barreiras, atrás da bolinha). */
  drawRain(ctx: CanvasRenderingContext2D, reducedMotion: boolean): void {
    const k = this.rain;
    if (k <= 0.01) return;
    const n = Math.round(this.drops.length * k * (reducedMotion ? 0.4 : 1));
    ctx.strokeStyle = 'rgba(205, 222, 255, 0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.25, d.y + d.len);
    }
    ctx.stroke();
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(235, 240, 255, ${(this.lightning * 0.35).toFixed(3)})`;
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    }
  }
}
