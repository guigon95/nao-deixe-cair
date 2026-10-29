import { ARENA, BODY, DASH, SWARM } from '../game/config';
import type { Engine } from '../game/Engine';
import { SIZES } from '../game/patterns';
import { GameState, type Crate, type Fruit, type Platform, type Rock, type Spring, type Thorns, type Vine } from '../game/types';
import { computeLayout, type Layout } from '../../../shared/layout/layout';
import type { Effects } from './effects';
import { biomeIndex, paletteAt, PALETTES, type Palette } from './palette';
import { drawCapivara, type Pose } from './capivara';
import { Weather } from './weather';

/** Onde o chão (y = 0) aparece na arena, sem câmera subindo. */
export const GROUND_Y = 288;

export const COLORS = {
  rock: '#8d929c',
  rockDark: '#5f646e',
  rockLight: '#c0c5ce',
  moss: '#6aa84f',
  crate: '#c58644',
  crateDark: '#7f4f1f',
  thorn: '#2d5a2a',
  thornTip: '#ff4d6d',
  branch: '#7a4a24',
  branchLight: '#a8703c',
  leaf: '#4caf50',
  petal: '#ff6fae',
  vine: '#7cb342',
  vineDark: '#4e6b25',
  grassBlade: '#3fd23f',
  grassDark: '#1f9a2a',
  grassOutline: '#123d0c',
  straw: '#e08a1e',
  gator: '#4f7a33',
  wasp: '#ffcc33',
  danger: '#ff3b5c',
  text: '#ffffff',
} as const;

interface DrawOptions {
  showHud: boolean;
  /** Tempo real (s), para animações cosméticas. */
  time: number;
}

/**
 * Desenha a corrida com Canvas 2D. A arena lógica 640×360 é escalada sem
 * esticar; as sobras (celular em pé, telas muito largas) mostram mais céu,
 * mais terra ou mais percurso — nunca tarja preta.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  layout: Layout = computeLayout(1, 1, ARENA);
  private dpr = 1;
  private viewL = 0;
  private viewR: number = ARENA.width;
  private viewT = 0;
  private viewB: number = ARENA.height;
  /** Câmera: x do mundo na borda esquerda da arena e quanto subiu (u). */
  camX = 0;
  lift = 0;
  private skyCache = new Map<string, CanvasGradient>();
  private hazeCache: CanvasGradient | null = null;
  private lastBiome = 0;
  /** Chuva (atualizada pelo hook a cada quadro). */
  readonly weather = new Weather();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr;
    this.layout = computeLayout(cssWidth, cssHeight, ARENA);
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const l = this.layout;
    this.viewL = -l.offsetX / l.scale;
    this.viewR = (cssWidth - l.offsetX) / l.scale;
    this.viewT = -l.offsetY / l.scale;
    this.viewB = (cssHeight - l.offsetY) / l.scale;
    this.skyCache.clear();
    this.hazeCache = null;
  }

  /** x da capivara interpolado entre passos (movimento suave em telas de 60–144 Hz). */
  private runnerPos(engine: Engine) {
    const r = engine.runner;
    const a = engine.alpha;
    return { x: r.prevX + (r.x - r.prevX) * a, y: r.prevY + (r.y - r.prevY) * a };
  }

  /** Atualiza a câmera (uma vez por quadro). */
  follow(engine: Engine, dt: number, snap = false): void {
    const p = this.runnerPos(engine);
    this.camX = p.x - BODY.screenX;
    // Sobe a câmera só quando a capivara vai muito alto (mola): o chão quase sempre visível.
    const target = Math.min(80, Math.max(0, p.y - 190) * 0.55);
    this.lift = snap ? target : this.lift + (target - this.lift) * Math.min(1, dt * 8);
  }

  sx(wx: number): number {
    return wx - this.camX;
  }

  sy(wy: number): number {
    return GROUND_Y - (wy - this.lift);
  }

  draw(engine: Engine, fx: Effects, opts: DrawOptions): void {
    const ctx = this.ctx;
    const l = this.layout;
    const s = l.scale * this.dpr;
    let shx = 0;
    let shy = 0;
    if (fx.shake > 0 && !fx.reducedMotion) {
      shx = (Math.random() - 0.5) * 9 * fx.shake;
      shy = (Math.random() - 0.5) * 9 * fx.shake;
    }
    ctx.setTransform(s, 0, 0, s, (l.offsetX + shx * l.scale) * this.dpr, (l.offsetY + shy * l.scale) * this.dpr);

    const meters = engine.score.meters;
    const pal = paletteAt(engine.state === GameState.READY ? 0 : meters);
    const biome = biomeIndex(meters);
    if (engine.state === GameState.PLAYING && biome !== this.lastBiome && meters > 0) fx.showBanner(PALETTES[biome].name);
    this.lastBiome = engine.state === GameState.PLAYING ? biome : 0;
    if (engine.state === GameState.PLAYING && this.weather.started) fx.showBanner('CHUVA!');

    this.drawSky(pal, opts.time);
    if (this.weather.rain > 0) this.drawStormClouds(opts.time);
    this.drawHills(pal);
    this.drawTrees(pal);
    this.drawGround(engine, pal, opts.time);
    this.drawGators(engine, opts.time);
    const lvl = engine.track.level;
    for (const p of lvl.platforms) this.drawPlatform(p, pal);
    for (const v of lvl.vines) this.drawVine(v, engine, opts.time);
    for (const sp of lvl.springs) this.drawSpring(sp, engine.elapsed);
    for (const c of lvl.crates) if (!c.broken) this.drawCrate(c);
    for (const r of lvl.rocks) if (!r.broken) this.drawRock(r);
    for (const t of lvl.thorns) if (!t.broken) this.drawThorns(t);
    for (const f of lvl.fruits) if (!f.taken) this.drawFruit(f, opts.time);
    this.drawParticles(fx);
    this.drawRunner(engine, fx, opts.time);
    this.drawSwarm(engine, opts.time);
    if (pal.fireflies > 0.05) this.drawFireflies(pal, opts.time);
    if (this.weather.rain > 0) this.drawRain(fx);
    this.drawFloaters(fx);
    if (opts.showHud) this.drawHud(engine, fx, opts.time);
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(fx.flash * (fx.reducedMotion ? 0.2 : 0.5)).toFixed(3)})`;
      ctx.fillRect(this.viewL, this.viewT, this.viewR - this.viewL, this.viewB - this.viewT);
    }
  }

  // ───────────────────────────── cenário

  private drawSky(pal: Palette, time: number): void {
    const ctx = this.ctx;
    const key = pal.skyTop + pal.skyBottom;
    let g = this.skyCache.get(key);
    if (!g) {
      g = ctx.createLinearGradient(0, this.viewT, 0, GROUND_Y);
      g.addColorStop(0, pal.skyTop);
      g.addColorStop(1, pal.skyBottom);
      if (this.skyCache.size > 64) this.skyCache.clear();
      this.skyCache.set(key, g);
    }
    ctx.fillStyle = g;
    ctx.fillRect(this.viewL, this.viewT, this.viewR - this.viewL, this.viewB - this.viewT);
    if (pal.stars > 0.05) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const x = this.viewL + hash(i * 3.1) * (this.viewR - this.viewL);
        const y = this.viewT + hash(i * 7.7) * (GROUND_Y - 120 - this.viewT);
        ctx.globalAlpha = pal.stars * (0.4 + 0.5 * Math.abs(Math.sin(time * 1.3 + i)));
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }
    // Sol/lua quase parados (parallax mínimo).
    const sunX = 470 - ((this.camX * 0.005) % 80);
    ctx.fillStyle = pal.sun;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(sunX, 70 + this.lift * 0.05, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(sunX, 70 + this.lift * 0.05, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** Morros distantes (parallax 0,15). */
  private drawHills(pal: Palette): void {
    const ctx = this.ctx;
    const base = this.sy(0) - 70 + this.lift * 0.7;
    ctx.fillStyle = pal.far;
    ctx.beginPath();
    ctx.moveTo(this.viewL, this.viewB);
    for (let x = this.viewL; x <= this.viewR + 16; x += 16) {
      const wx = x + this.camX * 0.15;
      const h = 34 * Math.sin(wx / 210) + 18 * Math.sin(wx / 83 + 1.7) + 50;
      ctx.lineTo(x, base - h);
    }
    ctx.lineTo(this.viewR + 16, this.viewB);
    ctx.closePath();
    ctx.fill();
  }

  /** Mata do meio (parallax 0,4) e moitas próximas (0,7). Posições determinísticas. */
  private drawTrees(pal: Palette): void {
    const ctx = this.ctx;
    const ground = this.sy(0);
    // Árvores: tronco + copa de três círculos.
    const par = 0.4;
    const spacing = 74;
    const offset = this.camX * par;
    const first = Math.floor((this.viewL + offset) / spacing) - 1;
    const last = Math.ceil((this.viewR + offset) / spacing) + 1;
    for (let i = first; i <= last; i++) {
      const r1 = hash(i * 1.37);
      const r2 = hash(i * 2.91 + 4);
      const x = i * spacing + r1 * 40 - offset;
      const h = 70 + r2 * 90;
      const base = ground - 8 + this.lift * 0.4;
      ctx.fillStyle = pal.midDark;
      ctx.fillRect(x - 4, base - h, 8, h);
      ctx.fillStyle = r1 > 0.5 ? pal.mid : pal.midDark;
      const cr = 22 + r2 * 16;
      ctx.beginPath();
      ctx.arc(x, base - h, cr, 0, Math.PI * 2);
      ctx.moveTo(x - cr * 0.8 + cr * 0.7, base - h + cr * 0.35);
      ctx.arc(x - cr * 0.8, base - h + cr * 0.35, cr * 0.7, 0, Math.PI * 2);
      ctx.moveTo(x + cr * 0.8 + cr * 0.75, base - h + cr * 0.3);
      ctx.arc(x + cr * 0.8, base - h + cr * 0.3, cr * 0.75, 0, Math.PI * 2);
      ctx.fill();
      // Palmeira de vez em quando.
      if (r2 > 0.82) {
        ctx.strokeStyle = pal.mid;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(x, base - h - cr * 0.6);
          ctx.quadraticCurveTo(x + k * 14, base - h - cr - 10, x + k * 26, base - h - cr * 0.4 + Math.abs(k) * 6);
          ctx.stroke();
        }
      }
    }
    // Moitas na beira do caminho.
    const par2 = 0.7;
    const sp2 = 56;
    const off2 = this.camX * par2;
    const f2 = Math.floor((this.viewL + off2) / sp2) - 1;
    const l2 = Math.ceil((this.viewR + off2) / sp2) + 1;
    ctx.fillStyle = pal.near;
    ctx.beginPath();
    for (let i = f2; i <= l2; i++) {
      const r = hash(i * 5.3 + 9);
      const x = i * sp2 - off2;
      const rr = 16 + r * 18;
      ctx.moveTo(x + rr, ground - 2);
      ctx.arc(x, ground - 2 + this.lift * 0.2, rr, 0, Math.PI, true);
    }
    ctx.fill();
  }

  /** Chão (trechos) e rio (buracos). */
  private drawGround(engine: Engine, pal: Palette, time: number): void {
    const ctx = this.ctx;
    const g0 = this.sy(0);
    // Rio por baixo de tudo: aparece nos buracos.
    const waterY = this.sy(-24);
    ctx.fillStyle = '#1c2a1f';
    ctx.fillRect(this.viewL, g0, this.viewR - this.viewL, this.viewB - g0);
    ctx.fillStyle = pal.water;
    ctx.fillRect(this.viewL, waterY, this.viewR - this.viewL, this.viewB - waterY);
    ctx.strokeStyle = pal.waterLight;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = this.viewL; x <= this.viewR + 10; x += 10) {
      const y = waterY + Math.sin((x + this.camX) / 18 + time * 3) * 2;
      if (x === this.viewL) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    for (const g of engine.track.level.ground) {
      const x0 = this.sx(g.x0);
      const x1 = this.sx(g.x1);
      if (x1 < this.viewL - 10 || x0 > this.viewR + 10) continue;
      const a = Math.max(x0, this.viewL - 10);
      const b = Math.min(x1, this.viewR + 10);
      ctx.fillStyle = pal.dirt;
      ctx.fillRect(a, g0, b - a, this.viewB - g0);
      ctx.fillStyle = pal.dirtDark;
      // Pedrinhas na terra (determinísticas pelo x do mundo).
      const step = 46;
      const from = Math.floor((a + this.camX) / step);
      const to = Math.ceil((b + this.camX) / step);
      for (let i = from; i <= to; i++) {
        const wx = i * step + hash(i * 3.3) * 20;
        const x = wx - this.camX;
        if (x < a + 4 || x > b - 4) continue;
        ctx.fillRect(x, g0 + 22 + hash(i * 1.9) * 40, 5, 3);
      }
      ctx.fillRect(a, g0 + 12, b - a, 3);
      // Grama
      ctx.fillStyle = pal.grass;
      ctx.fillRect(a, g0 - 2, b - a, 12);
      ctx.fillStyle = pal.grassEdge;
      ctx.fillRect(a, g0 - 3, b - a, 3);
      // Beiradas arredondadas nos buracos.
      if (x1 < this.viewR + 10) {
        ctx.fillStyle = pal.dirtDark;
        ctx.fillRect(x1 - 4, g0, 4, this.viewB - g0);
      }
      if (x0 > this.viewL - 10) {
        ctx.fillStyle = pal.dirtDark;
        ctx.fillRect(x0, g0, 4, this.viewB - g0);
      }
    }
  }

  private drawPlatform(p: Platform, pal: Palette): void {
    const ctx = this.ctx;
    const x0 = this.sx(p.x0);
    const x1 = this.sx(p.x1);
    if (x1 < this.viewL - 20 || x0 > this.viewR + 20) return;
    const y = this.sy(p.y);
    // Cipós segurando o galho (vêm do alto da tela).
    ctx.strokeStyle = pal.midDark;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0 + 10, this.viewT);
    ctx.lineTo(x0 + 10, y);
    ctx.moveTo(x1 - 10, this.viewT);
    ctx.lineTo(x1 - 10, y);
    ctx.stroke();
    ctx.fillStyle = COLORS.branch;
    roundRect(ctx, x0, y - 2, x1 - x0, 13, 6);
    ctx.fill();
    ctx.fillStyle = COLORS.branchLight;
    ctx.fillRect(x0 + 6, y, x1 - x0 - 12, 3);
    ctx.fillStyle = COLORS.leaf;
    ctx.beginPath();
    ctx.ellipse(x0 + 4, y - 4, 9, 5, -0.5, 0, Math.PI * 2);
    ctx.ellipse(x1 - 4, y - 4, 9, 5, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Cipó: pendurado e balançando de leve; quando a capivara agarra, vai até as patas dela. */
  private drawVine(v: Vine, engine: Engine, time: number): void {
    const ctx = this.ctx;
    const ax = this.sx(v.ax);
    if (ax < this.viewL - v.len || ax > this.viewR + 40) return;
    const ay = this.sy(v.ay);
    const r = engine.runner;
    const held = r.swinging && r.swAx === v.ax && engine.state !== GameState.GAME_OVER;
    let ex: number;
    let ey: number;
    if (held) {
      const p = this.runnerPos(engine);
      ex = this.sx(p.x) + 6;
      ey = this.sy(p.y + 24);
    } else {
      const sway = Math.sin(time * 1.6 + v.ax * 0.01) * 0.05;
      ex = ax + Math.sin(sway) * v.len;
      ey = ay + Math.cos(sway) * v.len;
    }
    const mx = (ax + ex) / 2 + (held ? 0 : 6);
    const my = (ay + ey) / 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = COLORS.vineDark;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(ax, Math.min(ay, this.viewT - 4));
    ctx.lineTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = COLORS.vine;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Folhinhas ao longo do cipó e um nó na ponta (onde agarra).
    ctx.fillStyle = COLORS.leaf;
    for (let i = 1; i <= 4; i++) {
      const k = i / 5;
      const x = (1 - k) * (1 - k) * ax + 2 * (1 - k) * k * mx + k * k * ex;
      const y = (1 - k) * (1 - k) * ay + 2 * (1 - k) * k * my + k * k * ey;
      ctx.beginPath();
      ctx.ellipse(x + (i % 2 ? 5 : -5), y, 5, 2.4, i % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!held) {
      ctx.fillStyle = COLORS.vineDark;
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRock(r: Rock): void {
    const ctx = this.ctx;
    const x0 = this.sx(r.x0);
    const x1 = this.sx(r.x1);
    if (x1 < this.viewL - 10 || x0 > this.viewR + 10) return;
    const top = this.sy(r.top);
    const base = this.sy(0) + 2;
    const w = x1 - x0;
    ctx.fillStyle = COLORS.rockDark;
    ctx.beginPath();
    ctx.moveTo(x0 - 2, base);
    ctx.lineTo(x0 + w * 0.08, top + (base - top) * 0.3);
    ctx.quadraticCurveTo(x0 + w * 0.3, top - 3, x0 + w * 0.6, top);
    ctx.quadraticCurveTo(x1 + 1, top + 2, x1 + 2, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.rock;
    ctx.beginPath();
    ctx.moveTo(x0 + 2, base);
    ctx.lineTo(x0 + w * 0.12, top + (base - top) * 0.32);
    ctx.quadraticCurveTo(x0 + w * 0.32, top + 1, x0 + w * 0.58, top + 3);
    ctx.quadraticCurveTo(x1 - 3, top + 6, x1 - 4, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.rockLight;
    ctx.beginPath();
    ctx.ellipse(x0 + w * 0.36, top + 7, w * 0.15, 3, -0.2, 0, Math.PI * 2);
    ctx.fill();
    if (r.top > 40 || r.variant === 2) {
      ctx.fillStyle = COLORS.moss;
      ctx.beginPath();
      ctx.ellipse(x0 + w * 0.5, top + 1, w * 0.3, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCrate(c: Crate): void {
    const ctx = this.ctx;
    const x0 = this.sx(c.x0);
    if (x0 > this.viewR + 10 || x0 + SIZES.crate.w < this.viewL - 10) return;
    const top = this.sy(c.top);
    const w = c.x1 - c.x0;
    const h = this.sy(0) - top;
    ctx.fillStyle = COLORS.crate;
    ctx.fillRect(x0, top, w, h);
    ctx.strokeStyle = COLORS.crateDark;
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 + 1.5, top + 1.5, w - 3, h - 3);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x0 + 3, top + 3);
    ctx.lineTo(x0 + w - 3, top + h - 3);
    ctx.moveTo(x0 + w - 3, top + 3);
    ctx.lineTo(x0 + 3, top + h - 3);
    ctx.stroke();
  }

  private drawThorns(t: Thorns): void {
    const ctx = this.ctx;
    const x0 = this.sx(t.x0);
    const x1 = this.sx(t.x1);
    if (x1 < this.viewL - 10 || x0 > this.viewR + 10) return;
    const base = this.sy(0) + 1;
    const top = this.sy(t.top);
    ctx.fillStyle = COLORS.thorn;
    ctx.beginPath();
    ctx.moveTo(x0, base);
    const n = Math.max(3, Math.round((x1 - x0) / 9));
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = i % 2 === 0 ? top + 6 : top - 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(x1, base);
    ctx.closePath();
    ctx.fill();
    // Pontas vermelhas: perigo legível em qualquer paleta.
    ctx.fillStyle = COLORS.thornTip;
    for (let i = 1; i <= n; i += 2) {
      const x = x0 + ((x1 - x0) * i) / n;
      ctx.beginPath();
      ctx.moveTo(x - 3, top + 2);
      ctx.lineTo(x, top - 5);
      ctx.lineTo(x + 3, top + 2);
      ctx.fill();
    }
  }

  private drawSpring(sp: Spring, now: number): void {
    const ctx = this.ctx;
    const x0 = this.sx(sp.x0);
    const w = sp.x1 - sp.x0;
    if (x0 > this.viewR + 20 || x0 + w < this.viewL - 20) return;
    const since = now - sp.usedAt;
    const squash = since >= 0 && since < 0.3 ? Math.sin((since / 0.3) * Math.PI) : 0;
    const base = this.sy(0);
    const h = (SIZES.spring.h + 4) * (1 - squash * 0.5);
    const cx = x0 + w / 2;
    ctx.strokeStyle = '#3f9a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, base);
    for (let i = 1; i <= 4; i++) ctx.lineTo(cx + (i % 2 ? 5 : -5), base - (h * i) / 4);
    ctx.stroke();
    ctx.fillStyle = COLORS.petal;
    ctx.beginPath();
    ctx.ellipse(cx, base - h, w / 2 + 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.ellipse(cx, base - h - 1, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Maço de capim (o que a capivara come todo dia). Precisa se destacar da
   * mata verde em qualquer paleta: disco creme opaco com aro escuro, folhas
   * com contorno verde-escuro e amarradinho de palha laranja na base.
   */
  private drawFruit(f: Fruit, time: number): void {
    const ctx = this.ctx;
    const x = this.sx(f.x);
    if (x < this.viewL - 12 || x > this.viewR + 12) return;
    const y = this.sy(f.y) + Math.sin(time * 4 + f.x * 0.05) * 1.5;
    // Disco de fundo
    if (f.risky) {
      ctx.fillStyle = `rgba(255, 214, 90, ${(0.45 + 0.25 * Math.sin(time * 6)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255, 248, 214, 0.88)';
    ctx.strokeStyle = 'rgba(40, 60, 20, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineCap = 'round';
    // Contorno escuro das folhas (por baixo) …
    ctx.strokeStyle = COLORS.grassOutline;
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    for (const [dx, h, lean] of CAPIM) {
      ctx.moveTo(x + dx * 0.8, y + 6);
      ctx.quadraticCurveTo(x + dx + lean * 0.4, y + 6 - h * 0.6, x + dx + lean, y + 6 - h);
    }
    ctx.stroke();
    // … e as folhas por cima, verdes vivas.
    for (let k = 0; k < CAPIM.length; k++) {
      const [dx, h, lean] = CAPIM[k];
      ctx.strokeStyle = k % 2 ? COLORS.grassDark : COLORS.grassBlade;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(x + dx * 0.8, y + 6);
      ctx.quadraticCurveTo(x + dx + lean * 0.4, y + 6 - h * 0.6, x + dx + lean, y + 6 - h);
      ctx.stroke();
    }
    // Amarradinho de palha.
    ctx.fillStyle = COLORS.straw;
    ctx.fillRect(x - 4.5, y + 2.5, 9, 3);
  }

  /** Jacaré de tocaia no rio: olhos e focinho na superfície, no meio de cada buraco. */
  private drawGators(engine: Engine, time: number): void {
    const ctx = this.ctx;
    const ground = engine.track.level.ground;
    const waterY = this.sy(-24);
    for (let i = 0; i + 1 < ground.length; i++) {
      const a = this.sx(ground[i].x1);
      const b = this.sx(ground[i + 1].x0);
      if (b < this.viewL || a > this.viewR || b - a < 50) continue;
      const cx = (a + b) / 2 + Math.sin(time * 0.8 + i) * Math.min(14, (b - a) / 6);
      const bobY = waterY + Math.sin(time * 2.2 + i) * 1.2;
      ctx.save();
      ctx.translate(cx, bobY);
      ctx.scale(1.45, 1.45);
      ctx.translate(-cx, -bobY);
      ctx.fillStyle = COLORS.gator;
      ctx.beginPath();
      ctx.ellipse(cx + 12, bobY + 1, 16, 3.5, 0, 0, Math.PI * 2); // focinho
      ctx.ellipse(cx - 8, bobY - 1, 5.5, 4.5, 0, 0, Math.PI * 2); // olhos (corcovas)
      ctx.ellipse(cx + 1, bobY - 1, 5.5, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8f27a';
      ctx.beginPath();
      ctx.arc(cx - 7.5, bobY - 2.5, 1.6, 0, Math.PI * 2);
      ctx.arc(cx + 1.5, bobY - 2.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16260f';
      ctx.fillRect(cx - 7.8, bobY - 3.6, 0.8, 2.2);
      ctx.fillRect(cx + 1.2, bobY - 3.6, 0.8, 2.2);
      ctx.restore();
    }
  }

  // ───────────────────────────── personagens

  private drawRunner(engine: Engine, fx: Effects, time: number): void {
    const r = engine.runner;
    const p = this.runnerPos(engine);
    const x = this.sx(p.x);
    let y = this.sy(p.y);
    let pose: Pose;
    let tilt = 0;
    if (engine.state === GameState.GAME_OVER) {
      pose = 'dead';
      const d = Math.min(engine.deadTime, 1.2);
      // Pulinho de derrota (cosmético).
      if (engine.deathCause !== 'river') y -= 60 * d - 90 * d * d;
      else y += 30 * d;
      tilt = engine.deathCause === 'swarm' ? 0.3 : Math.min(Math.PI, d * 6);
    } else if (engine.state === GameState.READY) pose = 'run';
    else if (r.dash > 0) {
      pose = 'dash';
      tilt = 0.08;
    } else if (r.swinging) {
      pose = 'fall';
      tilt = r.swTh * 0.6;
    } else if (r.grounded) pose = 'run';
    else if (r.gliding) pose = 'glide';
    else pose = r.vy > 60 ? 'rise' : 'fall';

    const ctx = this.ctx;
    if (r.dash > 0 && !fx.reducedMotion) {
      // Rastro do dash.
      ctx.fillStyle = 'rgba(255, 170, 60, 0.35)';
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.ellipse(x - i * 16, y - 17, 18, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const ly = y - 6 - i * 8;
        const lx = x - 40 - ((time * 900 + i * 37) % 120);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx - 30, ly);
        ctx.stroke();
      }
    }
    // Sombra no chão (ajuda a ler a altura do pulo).
    if (engine.state !== GameState.GAME_OVER && engine.track.level.groundAt(p.x)) {
      const h = Math.max(0, p.y);
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.06, 0.25 - h / 900).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x + 4, this.sy(0) + 1, Math.max(6, 18 - h / 20), 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const landing = r.landedAt < 0.14 ? 1 - r.landedAt / 0.14 : 0;
    drawCapivara(ctx, x, y, {
      pose,
      run: engine.state === GameState.READY ? time * 12 : (p.x / 28) % (Math.PI * 2),
      squash: fx.reducedMotion ? 0 : Math.max(landing * 0.8, fx.pressPulse * 0.4),
      time,
      tilt,
    });
  }

  /** Enxame de marimbondos na borda esquerda: quanto mais perto, mais denso e visível. */
  private drawSwarm(engine: Engine, time: number): void {
    const ctx = this.ctx;
    const d = engine.swarm;
    const front = BODY.screenX - d; // x da frente do enxame na arena
    if (front < this.viewL - 60) return;
    const groundY = this.sy(0);
    if (!this.hazeCache) {
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 150);
      g.addColorStop(0, 'rgba(30, 20, 10, 0.55)');
      g.addColorStop(1, 'rgba(30, 20, 10, 0)');
      this.hazeCache = g;
    }
    ctx.save();
    ctx.translate(front - 70, groundY - 90);
    ctx.fillStyle = this.hazeCache;
    ctx.fillRect(-160, -160, 320, 320);
    ctx.restore();
    for (let i = 0; i < 34; i++) {
      const r1 = hash(i * 2.17);
      const r2 = hash(i * 5.71 + 1);
      const a = time * (3 + r1 * 4) + r2 * 10;
      const x = front - 10 - r1 * 120 + Math.cos(a) * (8 + r2 * 14);
      const y = groundY - 10 - r2 * 170 + Math.sin(a * 1.3) * 10;
      if (x < this.viewL - 10) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const flap = Math.abs(Math.sin(time * 40 + i)) * 3;
      ctx.beginPath();
      ctx.ellipse(x - 1, y - 3, 2.6, 1 + flap, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.wasp;
      ctx.beginPath();
      ctx.ellipse(x, y, 4.2, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1306';
      ctx.fillRect(x - 0.8, y - 2.6, 1.6, 5.2);
      ctx.fillRect(x + 2, y - 2, 1.2, 4);
    }
  }

  /** Nuvens carregadas cobrindo o sol (aparecem com a chuva). */
  private drawStormClouds(time: number): void {
    const ctx = this.ctx;
    const k = this.weather.rain;
    ctx.fillStyle = `rgba(70, 82, 100, ${(0.5 * k).toFixed(3)})`;
    ctx.fillRect(this.viewL, this.viewT, this.viewR - this.viewL, this.viewB - this.viewT);
    const w = this.viewR - this.viewL;
    // Faixa contínua no alto + duas camadas de nuvens achatadas que andam devagar.
    ctx.fillStyle = `rgba(88, 98, 115, ${(0.85 * k).toFixed(3)})`;
    ctx.fillRect(this.viewL, this.viewT, w, 22 - this.viewT);
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? `rgba(104, 114, 132, ${(0.85 * k).toFixed(3)})` : `rgba(78, 88, 106, ${(0.9 * k).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const x = this.viewL + ((i * 113 + layer * 57 + this.camX * (0.04 + layer * 0.03) + time * (4 + layer * 3)) % (w + 220)) - 110;
        const y = 22 + layer * 16 + hash(i * 3.7 + layer) * 22;
        const r = 40 + hash(i * 5.1 + layer) * 30;
        ctx.moveTo(x + r * 1.7, y);
        ctx.ellipse(x, y, r * 1.7, r * 0.55, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  /** Gotas inclinadas, respingos no chão, leve escurecimento e relâmpago. */
  private drawRain(fx: Effects): void {
    const ctx = this.ctx;
    const wx = this.weather;
    const k = wx.rain;
    const W = this.viewR - this.viewL;
    const H = this.viewB - this.viewT;
    ctx.fillStyle = `rgba(30, 40, 60, ${(0.18 * k).toFixed(3)})`;
    ctx.fillRect(this.viewL, this.viewT, W, H);
    const n = Math.round(wx.drops.length * k * (fx.reducedMotion ? 0.4 : 1));
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const d = wx.drops[i];
      const x = this.viewL + (d.x / 640) * W;
      const y = this.viewT + (d.y / 360) * H;
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.len * 0.28, y + d.len);
    }
    ctx.stroke();
    // Respingos na linha do chão.
    const g = this.sy(0);
    ctx.strokeStyle = 'rgba(220, 235, 255, 0.6)';
    ctx.beginPath();
    for (let i = 0; i < n; i += 4) {
      const d = wx.drops[i];
      const x = this.viewL + (((d.x * 1.7 + i * 37) % 700) / 640) * W;
      const p = (d.y % 60) / 60;
      if (p > 0.35) continue;
      const r = 2 + p * 9;
      ctx.moveTo(x - r, g - p * 3);
      ctx.quadraticCurveTo(x, g - 4 - p * 6, x + r, g - p * 3);
    }
    ctx.stroke();
    if (wx.lightning > 0) {
      ctx.fillStyle = `rgba(235, 240, 255, ${(wx.lightning * 0.45).toFixed(3)})`;
      ctx.fillRect(this.viewL, this.viewT, W, H);
    }
  }

  private drawFireflies(pal: Palette, time: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#fff6a0';
    for (let i = 0; i < 18; i++) {
      const x = this.viewL + ((hash(i * 4.1) * (this.viewR - this.viewL) - time * 20 * (0.5 + hash(i))) % (this.viewR - this.viewL) + (this.viewR - this.viewL)) % (this.viewR - this.viewL);
      const y = this.sy(0) - 30 - hash(i * 9.3) * 160 + Math.sin(time + i) * 8;
      ctx.globalAlpha = pal.fireflies * (0.3 + 0.7 * Math.abs(Math.sin(time * 2 + i * 1.7)));
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawParticles(fx: Effects): void {
    const ctx = this.ctx;
    for (const p of fx.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(this.sx(p.x) - p.size / 2, this.sy(p.y) - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(fx: Effects): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const f of fx.floaters) {
      if (!f.active) continue;
      ctx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.5));
      ctx.font = f.big ? '900 20px system-ui, sans-serif' : '800 13px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(f.text, this.sx(f.x), this.sy(f.y));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, this.sx(f.x), this.sy(f.y));
    }
    ctx.globalAlpha = 1;
  }

  // ───────────────────────────── HUD

  private drawHud(engine: Engine, fx: Effects, time: number): void {
    const ctx = this.ctx;
    const W = ARENA.width;
    // Perigo: enxame perto → borda esquerda avermelhada pulsando.
    if (engine.swarm < SWARM.warn && engine.state !== GameState.GAME_OVER) {
      const k = 1 - engine.swarm / SWARM.warn;
      const g = ctx.createLinearGradient(this.viewL, 0, this.viewL + 120, 0);
      g.addColorStop(0, `rgba(255, 59, 92, ${(0.45 * k * (0.7 + 0.3 * Math.sin(time * 10))).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 59, 92, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.viewL, this.viewT, 120, this.viewB - this.viewT);
    }

    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    // Pontos no alto, ao centro.
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    const sc = String(engine.score.score);
    ctx.strokeText(sc, W / 2, 40);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(sc, W / 2, 40);
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.lineWidth = 3;
    const m = `${engine.score.meters} m`;
    ctx.strokeText(m, W / 2, 57);
    ctx.fillText(m, W / 2, 57);

    // Medidor do dash (canto superior direito): 12 tufos de capim.
    const n = DASH.meterMax;
    const full = engine.meterFull;
    const mx = W - 16 - n * 11;
    const my = 24;
    ctx.fillStyle = 'rgba(15, 20, 40, 0.45)';
    roundRect(ctx, mx - 10, my - 11, n * 11 + 14, 22, 11);
    ctx.fill();
    for (let i = 0; i < n; i++) {
      const on = i < engine.meter;
      ctx.fillStyle = on ? (full ? '#ffb347' : COLORS.grassBlade) : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(mx + i * 11, my, on ? 4.2 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (full) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 8);
      ctx.font = '900 12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(60, 25, 0, 0.6)';
      ctx.strokeText('DISPARADA PRONTA →', W - 10, my + 26);
      ctx.fillStyle = `rgba(255, 200, 90, ${pulse.toFixed(3)})`;
      ctx.fillText('DISPARADA PRONTA →', W - 10, my + 26);
    }

    // Dicas nos primeiros segundos.
    if (engine.state === GameState.PLAYING && engine.elapsed < 5) {
      const a = Math.min(1, (5 - engine.elapsed) / 1.2);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      const l1 = 'Toque: pula  ·  Segure: pula alto e plana';
      ctx.strokeText(l1, W / 2, 112);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(l1, W / 2, 112);
      ctx.font = '700 12px system-ui, sans-serif';
      const l2 = 'Coma capim e fuja dos marimbondos! Cuidado com o jacaré.';
      ctx.strokeText(l2, W / 2, 132);
      ctx.fillText(l2, W / 2, 132);
      ctx.globalAlpha = 1;
    }
    if (fx.bannerLife > 0) {
      ctx.globalAlpha = Math.min(1, fx.bannerLife / 0.5);
      ctx.textAlign = 'center';
      ctx.font = '900 22px system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeText(fx.banner, W / 2, 96);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(fx.banner, W / 2, 96);
      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Folhas do tufo de capim: deslocamento x, altura, inclinação. */
const CAPIM: ReadonlyArray<readonly [number, number, number]> = [
  [-4, 11, -5],
  [-2, 14, -2],
  [0, 16, 1],
  [2, 13, 4],
  [4, 10, 6],
];

/** Pseudoaleatório determinístico em [0, 1) para decoração. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
