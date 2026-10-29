import { ARENA, PHYSICS, playfield } from '../game/config';
import { difficultyAt } from '../game/Difficulty';
import type { GameEngine } from '../game/GameEngine';
import { GameState } from '../game/types';
import type { Effects } from './effects';
import { computeLayout, type Layout } from '../../../shared/layout/layout';
import { drawCoin, drawSkin, drawTrailDot } from './skins';
import { COINS } from '../game/config';
import type { SkinId, TrailId } from '../game/cosmetics';
import {
  blendPalette,
  dayAt,
  daylightOf,
  drawAutumn,
  drawAutumnBands,
  drawCanopy,
  drawFireflies,
  drawJungle,
  drawNightShade,
  drawSky,
  drawSnow,
  drawSnowBands,
  drawSpring,
  drawSpringBands,
  sceneryAt,
  weightOf,
  type Palette,
} from './scenery';
import { Weather } from './weather';

export const COLORS = {
  page: '#070b1c',
  arenaTop: '#101a3f',
  arenaBottom: '#0b1026',
  band: 'rgba(120, 140, 255, 0.06)',
  bandLine: 'rgba(150, 170, 255, 0.28)',
  star: '#9fb3ff',
  ball: '#ffd23f',
  ballCore: '#fff6cf',
  barrier: '#ff5577',
  barrierDark: '#b8264a',
  barrierEdge: '#ffd1dc',
  passed: '#47e5bc',
  hud: '#f4f6ff',
  hudDim: 'rgba(220, 228, 255, 0.62)',
  record: '#47e5bc',
} as const;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Desenha a partida no Canvas 2D. Recursos caros (gradientes, sprite de
 * brilho) são criados só no redimensionamento, nunca a cada quadro.
 */
export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  layout: Layout = computeLayout(1, 1);
  private dpr = 1;
  private arenaGradient: CanvasGradient | null = null;
  private barrierGradient: CanvasGradient | null = null;
  private glowSprite: HTMLCanvasElement | null = null;
  /** Paleta do quadro atual (mistura dos cenários) e chave dos gradientes em cache. */
  private palette: Palette = blendPalette(sceneryAt(0));
  private gradientKey = '';
  /** Chuva (estado visual, atualizado pelo loop do jogo). */
  readonly weather = new Weather();
  /** Visual escolhido na loja. */
  look: { skin: SkinId; trail: TrailId } = { skin: 'classica', trail: 'padrao' };

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr;
    this.layout = computeLayout(cssWidth, cssHeight);
    const pw = Math.max(1, Math.round(cssWidth * dpr));
    const ph = Math.max(1, Math.round(cssHeight * dpr));
    if (this.canvas.width !== pw) this.canvas.width = pw;
    if (this.canvas.height !== ph) this.canvas.height = ph;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;

    this.gradientKey = ''; // recria os gradientes no próximo quadro
    this.glowSprite = makeGlowSprite(Math.ceil(PHYSICS.ballRadius * 4 * this.layout.scale * dpr));
  }

  draw(engine: GameEngine, fx: Effects, opts: { showHud: boolean; time: number }): void {
    const ctx = this.ctx;
    const { scale, offsetX, offsetY } = this.layout;
    const d = this.dpr;

    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, this.layout.cssWidth, this.layout.cssHeight);

    let sx = 0;
    let sy = 0;
    if (fx.shake > 0 && !fx.reducedMotion) {
      const m = fx.shake * fx.shake * 7;
      sx = (Math.random() - 0.5) * m;
      sy = (Math.random() - 0.5) * m;
    }
    ctx.setTransform(d * scale, 0, 0, d * scale, d * (offsetX + sx * scale), d * (offsetY + sy * scale));

    // Arena (recortada com cantos arredondados).
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, 0, 0, ARENA.width, ARENA.height, 18);
    ctx.clip();
    // Cenário: estação + hora do dia + chuva, misturados aos poucos pela pontuação.
    const score = engine.score.score;
    const scene = sceneryAt(score);
    const day = dayAt(score);
    this.usePalette(blendPalette(scene, day));
    const summer = weightOf(scene, 'verao');
    const autumn = weightOf(scene, 'outono');
    const winter = weightOf(scene, 'inverno');
    const spring = weightOf(scene, 'primavera');
    const daylight = daylightOf(day);
    const motion = !fx.reducedMotion;
    const wx = this.weather;
    ctx.fillStyle = this.arenaGradient ?? this.palette.skyBottom;
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);

    this.drawStars(fx, day.night * (1 - wx.rain));
    drawSky(ctx, day);
    wx.drawClouds(ctx, fx.clock);
    drawJungle(ctx, summer, fx.scroll, fx.clock, motion);
    drawAutumn(ctx, autumn, fx.scroll, fx.clock, motion);
    drawSnow(ctx, winter, fx.scroll, fx.clock, motion, wx.rain);
    drawSpring(ctx, spring, fx.scroll, fx.clock, motion, daylight);
    drawNightShade(ctx, day);
    drawFireflies(ctx, day.night * (summer + spring) * (1 - wx.rain), fx.clock, motion);
    this.drawBands();
    drawCanopy(ctx, summer, fx.scroll);
    drawAutumnBands(ctx, autumn, fx.scroll);
    drawSnowBands(ctx, winter, fx.scroll);
    drawSpringBands(ctx, spring, fx.scroll);
    this.drawBarriers(engine, Math.max(summer, autumn, spring));
    this.drawCoins(engine);
    // chuva por cima das barreiras e atrás da bolinha (no inverno a "chuva" é nevasca)
    if (winter < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - winter;
      wx.drawRain(ctx, fx.reducedMotion);
      ctx.restore();
    }
    this.drawTrail(engine, fx);
    this.drawParticles(fx);
    if (engine.state !== GameState.GAME_OVER || fx.flash > 0.6) this.drawBall(engine, fx, daylight);
    this.drawFloaters(fx);

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255, 80, 110, ${0.22 * fx.flash})`; // suave: nada de flash estroboscópico
      ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    }
    ctx.restore();

    if (opts.showHud) this.drawHud(engine, fx);
    if (engine.state === GameState.RESUMING) this.drawCountdown(engine.resumeCountdown);
  }

  /** Gradientes dependem da paleta: só são recriados quando ela muda. */
  private usePalette(p: Palette) {
    this.palette = p;
    const key = `${p.skyTop}${p.skyBottom}${p.barrier}${p.barrierDark}`;
    if (key === this.gradientKey) return;
    this.gradientKey = key;
    const ctx = this.ctx;
    this.arenaGradient = ctx.createLinearGradient(0, 0, 0, ARENA.height);
    this.arenaGradient.addColorStop(0, p.skyTop);
    this.arenaGradient.addColorStop(1, p.skyBottom);
    this.barrierGradient = ctx.createLinearGradient(0, 0, PHYSICS.ballRadius * 4.5, 0);
    this.barrierGradient.addColorStop(0, p.barrier);
    this.barrierGradient.addColorStop(1, p.barrierDark);
  }

  private drawStars(fx: Effects, visibility: number) {
    if (visibility <= 0.01) return;
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.star;
    for (const s of fx.stars) {
      ctx.globalAlpha = (0.15 + s.z * 0.35) * visibility;
      const size = 0.8 + s.z * 1.2;
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawBands() {
    const ctx = this.ctx;
    const { top, bottom } = playfield();
    ctx.fillStyle = this.palette.band;
    ctx.fillRect(0, 0, ARENA.width, top);
    ctx.fillRect(0, bottom, ARENA.width, ARENA.height - bottom);
    ctx.strokeStyle = this.palette.bandLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(ARENA.width, top + 0.5);
    ctx.moveTo(0, bottom - 0.5);
    ctx.lineTo(ARENA.width, bottom - 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawBarriers(engine: GameEngine, jungle: number) {
    const ctx = this.ctx;
    const a = engine.alpha;
    for (const b of engine.obstacles.barriers) {
      const x = b.prevX + (b.x - b.prevX) * a;
      if (x > ARENA.width + 4 || x + b.width < -4) continue;
      ctx.save();
      ctx.translate(x, 0);
      ctx.fillStyle = this.barrierGradient ?? this.palette.barrier;
      // Parte superior e inferior; cantos arredondados só no lado do vão.
      ctx.beginPath();
      roundRect(ctx, 0, -20, b.width, b.gapTop + 20, 10);
      roundRect(ctx, 0, b.gapBottom, b.width, ARENA.height - b.gapBottom + 20, 10);
      ctx.fill();

      // Listras diagonais: a barreira se distingue por textura, não só pela cor.
      ctx.save();
      ctx.clip();
      // noite: listras claras; selva: veios escuros de casca de árvore
      ctx.strokeStyle = this.palette.stripe;
      ctx.globalAlpha = 0.09 + 0.2 * jungle;
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let yy = -40; yy < ARENA.height + 40; yy += 22) {
        ctx.moveTo(-10, yy + 10);
        ctx.lineTo(b.width + 10, yy - 20);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();

      // Bordas do vão, mais claras, para ler a abertura de longe.
      const glow = b.passed ? Math.max(0, 1 - b.passGlow * 2.5) : 0;
      ctx.fillStyle = glow > 0 ? mix(this.palette.barrierEdge, COLORS.passed, glow) : this.palette.barrierEdge;
      ctx.beginPath();
      roundRect(ctx, 0, b.gapTop - 6, b.width, 6, 3);
      roundRect(ctx, 0, b.gapBottom, b.width, 6, 3);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawCoins(engine: GameEngine) {
    const a = engine.alpha;
    for (const c of engine.coins.coins) {
      if (!c.active) continue;
      const x = c.prevX + (c.x - c.prevX) * a;
      if (x < -12 || x > ARENA.width + 12) continue;
      drawCoin(this.ctx, x, c.y, COINS.radius, c.spin);
    }
  }

  private drawTrail(engine: GameEngine, fx: Effects) {
    if (engine.state === GameState.READY) return;
    const ctx = this.ctx;
    const speed = difficultyAt(engine.elapsed).speed;
    const n = Math.min(fx.trailCount, fx.trailLength);
    const r = engine.ball.radius;
    for (let i = 0; i < n; i++) {
      const idx = (fx.trailHead - 1 - i + fx.trailY.length * 2) % fx.trailY.length;
      const age = fx.trailAge[idx];
      const x = engine.ball.x - age * speed;
      const t = 1 - i / fx.trailY.length;
      drawTrailDot(ctx, this.look.trail, x, fx.trailY[idx], r, t, i, fx.clock);
    }
    ctx.globalAlpha = 1;
  }

  private drawBall(engine: GameEngine, fx: Effects, daylight: number) {
    const ctx = this.ctx;
    const b = engine.ball;
    const y = b.prevY + (b.y - b.prevY) * engine.alpha;
    const r = b.radius;

    if (this.glowSprite) {
      const g = r * 4;
      ctx.globalAlpha = engine.holding ? 0.85 : 0.6;
      ctx.drawImage(this.glowSprite, b.x - g / 2, y - g / 2, g, g);
      ctx.globalAlpha = 1;
    }
    // Leve deformação proporcional à velocidade (não afeta colisão).
    const stretch = fx.reducedMotion ? 0 : Math.min(Math.abs(b.vy) / 480, 1) * 0.1;
    ctx.save();
    ctx.translate(b.x, y);
    ctx.scale(1 - stretch * 0.5, 1 + stretch);
    drawSkin(ctx, this.look.skin, r, fx.clock);
    if (daylight > 0.01) {
      // contorno para a bolinha não sumir no céu claro
      ctx.strokeStyle = `rgba(60, 35, 0, ${0.5 * daylight})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Anel de feedback ao pressionar.
    if (fx.pressPulse > 0) {
      ctx.strokeStyle = COLORS.ball;
      ctx.globalAlpha = fx.pressPulse * 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, y, r + (1 - fx.pressPulse) * 14 + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawParticles(fx: Effects) {
    const ctx = this.ctx;
    for (const p of fx.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(fx: Effects) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of fx.floaters) {
      if (!f.active) continue;
      const t = f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.font = `800 ${f.big ? 22 : 15}px ${FONT}`;
      // contorno escuro: o texto continua legível no céu claro da selva e da neve
      ctx.lineWidth = f.big ? 4 : 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(8, 14, 36, 0.55)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.big ? COLORS.record : COLORS.hud;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(engine: GameEngine, fx: Effects) {
    const ctx = this.ctx;
    const { top } = playfield();
    const score = engine.score.score;
    const best = Math.max(engine.score.best, engine.score.bestAtStart);
    const beating = engine.score.bestAtStart > 0 && score > engine.score.bestAtStart;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillStyle = beating ? COLORS.record : COLORS.hud;
    ctx.fillText(String(score), ARENA.width / 2, top / 2 + 2);

    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    ctx.textAlign = 'right';
    const bestLabel = beating ? 'NOVO RECORDE' : best > 0 ? `RECORDE ${best}` : '';
    if (bestLabel) {
      ctx.fillStyle = beating ? COLORS.record : COLORS.hudDim;
      ctx.fillText(bestLabel, ARENA.width - 16, top / 2 + 2);
    }

    // Vidas para continuar: corações à esquerda (depois do botão de pausa).
    if (engine.lives > 0) {
      for (let i = 0; i < engine.lives; i++) {
        drawHeart(ctx, 66 + i * 17, top / 2 + 2, 6.5, i < engine.livesLeft);
      }
    }

    // Moedas pegas nesta partida, no rodapé à esquerda.
    {
      const { bottom: b } = playfield();
      const cy = b + (ARENA.height - b) / 2;
      drawCoin(ctx, 24, cy, 6.5, 0);
      ctx.font = `800 13px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.hud;
      ctx.fillText(String(engine.coins.collected), 36, cy + 1);
    }

    // Indicador discreto de progresso: barra fina de “intensidade” no rodapé.
    const level = difficultyAt(engine.elapsed).level;
    const { bottom } = playfield();
    const by = bottom + (ARENA.height - bottom) / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(ARENA.width / 2 - 50, by - 1.5, 100, 3);
    ctx.fillStyle = beating || fx.recordGlow > 0 ? COLORS.record : COLORS.ball;
    ctx.fillRect(ARENA.width / 2 - 50, by - 1.5, 100 * level, 3);
    ctx.font = `600 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('VELOCIDADE', ARENA.width / 2, by + 11);
  }

  private drawCountdown(remaining: number) {
    const ctx = this.ctx;
    const n = Math.max(1, Math.ceil(remaining / 0.4));
    ctx.fillStyle = 'rgba(7, 11, 28, 0.45)';
    ctx.fillRect(0, 0, ARENA.width, ARENA.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 64px ${FONT}`;
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(String(n), ARENA.width / 2, ARENA.height / 2 - 40);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = COLORS.hudDim;
    ctx.fillText('Prepare-se…', ARENA.width / 2, ARENA.height / 2 + 6);
  }
}

/** Coração centrado em (x, y); cheio = vida disponível, vazado = vida usada. */
function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, filled: boolean) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.95);
  ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.9, y - r * 1.25, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.9, y - r * 1.25, x + r * 1.5, y - r * 0.1, x, y + r * 0.95);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = COLORS.barrier;
    ctx.fill();
  } else {
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.hudDim;
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function makeGlowSprite(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const s = Math.max(8, Math.min(size, 256));
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 210, 63, 0.55)');
    grad.addColorStop(0.35, 'rgba(255, 210, 63, 0.18)');
    grad.addColorStop(1, 'rgba(255, 210, 63, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  return c;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
