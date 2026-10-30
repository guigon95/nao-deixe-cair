import { computeLayout, type Layout } from '../../../shared/layout/layout';
import { ARENA, GRID, ITEMS } from '../game/config';
import type { Engine } from '../game/Engine';
import { DELTA, GameState } from '../game/types';
import type { Effects } from './effects';
import { drawHead, drawItem } from './sprites';

export const COLORS = {
  bg: '#14204a',
  boardA: '#2f8a4a',
  boardB: '#2a7d43',
  border: '#ffd23f',
  suit: '#23336a',
  suitLight: '#34488f',
  stripe: 'rgba(255,255,255,0.12)',
  tie: '#e8443a',
  sash: '#ffd23f',
} as const;

const C = GRID.cell;

/** Centro de uma célula na arena. */
export function cellCenter(x: number, y: number) {
  return { x: GRID.x + (x + 0.5) * C, y: GRID.y + (y + 0.5) * C };
}

export interface DrawOptions {
  time: number;
  showHud: boolean;
}

/**
 * Desenho em Canvas 2D. A arena lógica 360×640 é encaixada na tela sem
 * esticar (o que sobra vira moldura). O movimento é interpolado entre os
 * passos da grade, então a cobrinha desliza suave a 60/120 Hz.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  layout: Layout = computeLayout(1, 1);
  private dpr = 1;
  private board: HTMLCanvasElement | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    this.layout = computeLayout(cssWidth, cssHeight);
    this.dpr = dpr;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.board = this.makeBoard();
  }

  /** O tabuleiro (tapete xadrez + moldura) é estático: desenhado uma vez numa imagem. */
  private makeBoard(): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const s = this.layout.scale * this.dpr;
    const w = GRID.cols * C;
    const h = GRID.rows * C;
    const pad = 6;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((w + pad * 2) * s);
    cv.height = Math.ceil((h + pad * 2) * s);
    const g = cv.getContext('2d');
    if (!g) return null;
    g.scale(s, s);
    g.translate(pad, pad);
    // moldura dourada
    g.fillStyle = '#c99a1e';
    g.beginPath();
    g.roundRect(-5, -5, w + 10, h + 10, 10);
    g.fill();
    g.fillStyle = COLORS.border;
    g.beginPath();
    g.roundRect(-3, -3, w + 6, h + 6, 8);
    g.fill();
    g.save();
    g.beginPath();
    g.roundRect(0, 0, w, h, 6);
    g.clip();
    for (let y = 0; y < GRID.rows; y++) {
      for (let x = 0; x < GRID.cols; x++) {
        g.fillStyle = (x + y) % 2 === 0 ? COLORS.boardA : COLORS.boardB;
        g.fillRect(x * C, y * C, C, C);
      }
    }
    // tramas do "tapete do plenário"
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let i = -h; i < w; i += 11) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
    }
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    g.restore();
    return cv;
  }

  draw(engine: Engine, fx: Effects, opts: DrawOptions) {
    const ctx = this.ctx;
    const { scale, offsetX, offsetY, cssWidth, cssHeight } = this.layout;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    let sx = 0;
    let sy = 0;
    if (fx.shake > 0 && !fx.reducedMotion) {
      sx = (Math.random() - 0.5) * 10 * fx.shake;
      sy = (Math.random() - 0.5) * 10 * fx.shake;
    }
    ctx.setTransform(d * scale, 0, 0, d * scale, d * (offsetX + sx * scale), d * (offsetY + sy * scale));

    this.drawBackdrop(opts.time);
    if (this.board) {
      ctx.drawImage(this.board, GRID.x - 6, GRID.y - 6, GRID.cols * C + 12, GRID.rows * C + 12);
    }

    for (const it of engine.items) this.drawItemAt(it.kind, it.x, it.y, it.age, it.life, opts.time);
    this.drawSnake(engine, opts.time);
    fx.draw(ctx);
    if (opts.showHud) this.drawHud(engine);
    if (fx.banner) this.drawBanner(fx.banner.text, fx.banner.sub, fx.banner.life);
    if (engine.state === GameState.RESUMING) this.drawCountdown(engine.resumeCountdown);

    if (fx.flash > 0) {
      ctx.globalAlpha = fx.flash * 0.5;
      ctx.fillStyle = '#fff';
      ctx.fillRect(-20, -20, ARENA.width + 40, ARENA.height + 40);
      ctx.globalAlpha = 1;
    }
  }

  /** Fundo atrás do tabuleiro: azul com brilho dourado (cara de cenário de auditório). */
  private drawBackdrop(t: number) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, ARENA.height);
    g.addColorStop(0, '#1d2d66');
    g.addColorStop(1, '#0f173a');
    ctx.fillStyle = g;
    ctx.fillRect(-400, -400, ARENA.width + 800, ARENA.height + 800);
    ctx.fillStyle = 'rgba(255, 210, 63, 0.07)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 70 + t * 6) % (ARENA.width + 80)) - 40;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 30, 0);
      ctx.lineTo(x - 40, ARENA.height);
      ctx.lineTo(x - 70, ARENA.height);
      ctx.fill();
    }
  }

  private drawItemAt(kind: keyof typeof ITEMS, gx: number, gy: number, age: number, life: number, t: number) {
    const ctx = this.ctx;
    const p = cellCenter(gx, gy);
    // aparição: "pop" com leve passagem do tamanho final
    const k = Math.min(1, age / 0.28);
    const pop = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 7) : 1;
    let alpha = 1;
    if (life > 0) {
      const left = life - age;
      if (left < 2) alpha = Math.sin(age * 18) > 0 ? 1 : 0.35;
      // aura e relógio dos raros
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(t * 6) * 0.15;
      ctx.fillStyle = ITEMS[kind].color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, C * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, C * 0.78, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left / life));
      ctx.stroke();
      ctx.restore();
    }
    const bob = Math.sin(t * 3 + gx * 0.7 + gy) * 1.2;
    const size = C * (kind === 'mansao' ? 1.25 : 1.12) * pop;
    ctx.save();
    ctx.globalAlpha = alpha;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + C * 0.38, C * 0.34 * pop, C * 0.1 * pop, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(p.x, p.y + bob - 1);
    ctx.scale(size, size);
    drawItem(ctx, kind, t);
    ctx.restore();
  }

  private drawSnake(engine: Engine, t: number) {
    const ctx = this.ctx;
    const n = engine.snake.length;
    if (!n) return;
    const a = engine.state === GameState.PLAYING ? engine.progress : engine.state === GameState.GAME_OVER ? 0 : engine.progress;
    const pts = engine.snake.map((c, i) => {
      const p = engine.prev[i] ?? c;
      return cellCenter(p.x + (c.x - p.x) * a, p.y + (c.y - p.y) * a);
    });
    if (engine.state === GameState.READY) {
      // menu: respira de leve
      const b = Math.sin(t * 2.4) * 1.5;
      for (const p of pts) p.y += b;
    }
    const big = n >= 30;
    const radius = (i: number) => C * (0.42 - 0.12 * Math.pow(i / Math.max(1, n - 1), 1.5));

    // sombra do corpo
    ctx.save();
    ctx.translate(2, 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = C * 0.72;
    this.path(pts);
    ctx.stroke();
    ctx.restore();

    // terno: tubo contínuo + segmentos
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (big) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 210, 63, 0.8)';
      ctx.shadowBlur = 10 + Math.sin(t * 5) * 4;
    }
    ctx.strokeStyle = COLORS.suit;
    ctx.lineWidth = C * 0.62;
    this.path(pts);
    ctx.stroke();
    if (big) ctx.restore();
    for (let i = n - 1; i >= 1; i--) {
      const p = pts[i];
      ctx.fillStyle = i % 2 ? COLORS.suit : COLORS.suitLight;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius(i), 0, Math.PI * 2);
      ctx.fill();
      // risca de giz do terno
      ctx.strokeStyle = COLORS.stripe;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius(i) * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      const kind = engine.fill[i];
      if (kind) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(C * 0.56, C * 0.56);
        drawItem(ctx, kind, t + i * 0.3);
        ctx.restore();
      }
    }
    // faixa dourada de "autoridade" quando fica gigante
    if (big && n > 3) {
      ctx.strokeStyle = COLORS.sash;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      this.path(pts.slice(1, Math.min(n, 12)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // colarinho e gravata no primeiro segmento, apontando para a cabeça
    if (n > 1) {
      const h = pts[0];
      const b = pts[1];
      const ang = Math.atan2(h.y - b.y, h.x - b.x);
      ctx.save();
      ctx.translate(b.x + (h.x - b.x) * 0.45, b.y + (h.y - b.y) * 0.45);
      ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-C * 0.3, -C * 0.12);
      ctx.lineTo(0, C * 0.08);
      ctx.lineTo(C * 0.3, -C * 0.12);
      ctx.lineTo(C * 0.2, -C * 0.26);
      ctx.lineTo(-C * 0.2, -C * 0.26);
      ctx.closePath();
      ctx.fill();
      const sway = Math.sin(t * 8) * 0.12;
      ctx.rotate(sway);
      ctx.fillStyle = COLORS.tie;
      ctx.beginPath();
      ctx.moveTo(-C * 0.07, -C * 0.02);
      ctx.lineTo(C * 0.07, -C * 0.02);
      ctx.lineTo(C * 0.12, C * 0.42);
      ctx.lineTo(0, C * 0.56);
      ctx.lineTo(-C * 0.12, C * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // cabeça (sempre em pé: só os olhos e a boca acompanham a direção)
    const head = pts[0];
    const dir = DELTA[engine.dir];
    const dead = engine.state === GameState.GAME_OVER && engine.crashedAt !== null;
    const ahead = engine.items.some((it) => {
      const dx = it.x - engine.snake[0].x;
      const dy = it.y - engine.snake[0].y;
      return dx * dir.x + dy * dir.y > 0 && dx * dir.x + dy * dir.y <= 2 && dx * dir.y + dy * dir.x === 0;
    });
    const bite = engine.lastBite < 0.18 ? 1 - engine.lastBite / 0.18 : 0;
    const mouth = Math.max(bite, ahead ? 0.8 : 0);
    const chubby = Math.min(1, n / 40);
    const hs = C * (1.45 + chubby * 0.15) * (1 + bite * 0.08);
    ctx.save();
    ctx.translate(head.x + dir.x * 2, head.y + dir.y * 2 - 2);
    ctx.scale(hs, hs);
    drawHead(ctx, {
      lookX: dir.x,
      lookY: dir.y,
      mouth,
      dead,
      chubby,
      blink: !dead && t % 3.4 < 0.12,
    });
    ctx.restore();
  }

  private path(pts: { x: number; y: number }[]) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  }

  private drawHud(engine: Engine) {
    const ctx = this.ctx;
    ctx.textBaseline = 'middle';
    // placar central
    ctx.textAlign = 'center';
    ctx.font = '900 34px system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(8, 12, 32, 0.9)';
    ctx.strokeText(String(engine.score), ARENA.width / 2, 30);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(engine.score), ARENA.width / 2, 30);
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`TAMANHO ${engine.length}`, ARENA.width / 2, 58);
    // recorde à direita
    ctx.textAlign = 'right';
    ctx.font = '800 11px system-ui, sans-serif';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('RECORDE', ARENA.width - 14, 22);
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.fillText(String(Math.max(engine.best, engine.score)), ARENA.width - 14, 40);
    // multiplicador
    if (engine.multiplierTime > 0) {
      const x = ARENA.width / 2 + 72;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.roundRect(x - 22, 18, 44, 24, 12);
      ctx.fill();
      ctx.fillStyle = '#3a2400';
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.fillText('×2', x, 31);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x - 20, 46, 40, 4);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(x - 20, 46, 40 * (engine.multiplierTime / 8), 4);
    }
  }

  private drawBanner(text: string, sub: string, life: number) {
    const ctx = this.ctx;
    const k = Math.min(1, life * 2, (1.8 - life) * 6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    ctx.translate(ARENA.width / 2, GRID.y + 120);
    const s = 0.8 + 0.2 * Math.min(1, (1.8 - life) * 5);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(15, 23, 58, 0.85)';
    ctx.beginPath();
    ctx.roundRect(-140, -34, 280, sub ? 68 : 50, 16);
    ctx.fill();
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.font = '900 24px system-ui, sans-serif';
    ctx.fillText(text, 0, sub ? -10 : -9);
    if (sub) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText(sub, 0, 16);
    }
    ctx.restore();
  }

  private drawCountdown(left: number) {
    const ctx = this.ctx;
    const n = Math.max(1, Math.ceil(left / 0.4));
    ctx.save();
    ctx.fillStyle = 'rgba(8, 12, 32, 0.35)';
    ctx.fillRect(GRID.x, GRID.y, GRID.cols * C, GRID.rows * C);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 72px system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(8, 12, 32, 0.9)';
    ctx.strokeText(String(n), ARENA.width / 2, ARENA.height / 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(String(n), ARENA.width / 2, ARENA.height / 2);
    ctx.restore();
  }
}
