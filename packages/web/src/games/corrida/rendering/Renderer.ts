import { ARENA, BODY, DASH, GOLDEN, MAGNET, MOUNT, RECORD_SIGN_MIN, SCORING, SWARM, TOCA } from '../game/config';
import type { Engine } from '../game/Engine';
import { SIZES } from '../game/patterns';
import { logX } from '../game/Level';
import { GameState, type Burrow, type Log, type Crate, type Fruit, type ItemKind, type Platform, type Rock, type Spring, type Thorns, type Vine } from '../game/types';
import { computeLayout, type Layout } from '../../../shared/layout/layout';
import type { Effects } from './effects';
import { dominantSeason, mix, paletteAt, SEASONS, type Palette, type SeasonId } from './palette';
import { drawCapivara, type Pose } from './capivara';
import { drawMount, MOUNT_SEAT_DRAW, TUCANO_CARRY_DRAW } from './mounts';
import { drawTucano } from './tucano';
import { BIOMES, biomeWeights, dominantBiome, type BiomeId } from '../game/biome';
import { crateShake } from './crateShake';
import { Weather } from './weather';
import { boteShape, Gators, WATER_Y, type Gator } from './gators';

/** Onde o chão (y = 0) aparece na arena, sem câmera subindo. */
export const GROUND_Y = 288;
/** Quanto a câmera sobe no modo céu (tucano): sobra só uma faixa de terra. */
const SKY_LIFT = 52;

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
  magnet: '#e8322f',
  ipeRoxo: '#c45bd6',
  ipeAmarelo: '#ffd23a',
  grassBlade: '#3fd23f',
  grassDark: '#1f9a2a',
  grassOutline: '#123d0c',
  straw: '#e08a1e',
  gator: '#4f7a33',
  gatorDark: '#3e6328',
  gatorBelly: '#c9c98a',
  wasp: '#ffcc33',
  danger: '#ff3b5c',
  text: '#ffffff',
} as const;

interface DrawOptions {
  showHud: boolean;
  /** Com o ímã: batidas da música desde que ele ligou (as patas seguem o ritmo). */
  beat?: number | null;
  /** Tempo real (s), para animações cosméticas. */
  time: number;
}

/**
 * Desenha a corrida com Canvas 2D. A arena lógica 640×360 é escalada sem
 * esticar; as sobras (celular em pé, telas muito largas) mostram mais céu,
 * mais terra ou mais percurso — nunca tarja preta.
 */
/** Folhas secas que tampam a entrada da toca. */
const LEAF_COLORS = ['#b5762c', '#8a5a22', '#c99a3a', '#6f8a2c'];

/** Grãos de granola por cima do açaí (posições fixas). */
const ACAI_GRANOLA: ReadonlyArray<readonly [number, number]> = [
  [-7, -3],
  [-3, -6],
  [1, -4],
  [6, -5],
  [8, -2],
];

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
  /** Caminho recente da capivara (mundo): os filhotes seguem por ele. */
  private trail: Array<{ x: number; y: number }> = [];
  /** Filhotes fugindo depois de uma batida (só desenho). */
  private scattered: Array<{ x: number; y: number; vx: number; t: number; ph: number }> = [];
  /** 0..1: quanto do "modo céu" (tucano) está aparecendo. */
  sky = 0;
  private skyCache = new Map<string, CanvasGradient>();
  private hazeCache: CanvasGradient | null = null;
  private shieldAuraCache: CanvasGradient | null = null;
  private auraCache: CanvasGradient | null = null;
  private lastSeason: SeasonId = 'verao';
  private lastBiome: BiomeId = 'mata';
  /** Peso de cada bioma neste quadro (cenário). */
  private bw: Record<BiomeId, number> = { mata: 1, pantanal: 0, cerrado: 0, caatinga: 0 };
  /** Chuva (atualizada pelo hook a cada quadro). */
  readonly weather = new Weather();
  /** Botes do jacaré (atualizados pelo hook a cada quadro). */
  readonly gators = new Gators();
  /** Trecho de inverno na tela agora (o som da chuva vira o da neve). */
  winter = false;

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
    this.recordTrail(engine, p);
    for (let i = this.scattered.length - 1; i >= 0; i--) {
      const s = this.scattered[i];
      s.t += dt;
      s.x += s.vx * dt;
      if (s.t > 1.6) this.scattered.splice(i, 1);
    }
    // Sobe a câmera só quando a capivara vai alto (copa das árvores, mola). Pulos
    // normais (até ~160) não mexem a câmera; na copa (200) ela sobe ~55.
    // Na toca, desce para mostrar o túnel por baixo da terra.
    // Voando de tucano: a câmera sobe (mais céu, só uma faixa de terra).
    const skyTarget = engine.skyMode ? 1 : 0;
    this.sky = snap ? skyTarget : this.sky + (skyTarget - this.sky) * Math.min(1, dt * 2.2);
    const target = p.y < TOCA.below ? TOCA.camera : Math.max(SKY_LIFT * this.sky, Math.min(85, Math.max(0, p.y - 165) * 1.6));
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
    // Faixa quando a estação muda (no meio da transição, que é lenta).
    const season = engine.state === GameState.READY ? 'verao' : dominantSeason(meters);
    if (engine.state === GameState.PLAYING && season !== this.lastSeason) fx.showBanner(SEASONS.banner[season]);
    this.lastSeason = season;
    const biome = engine.state === GameState.READY ? 'mata' : dominantBiome(meters);
    if (engine.state === GameState.PLAYING && biome !== this.lastBiome) fx.showBanner(BIOMES.banner[biome]);
    this.lastBiome = biome;
    this.bw = engine.state === GameState.READY ? { mata: 1, pantanal: 0, cerrado: 0, caatinga: 0 } : biomeWeights(meters);
    this.winter = pal.winter >= 0.5;
    if (engine.state === GameState.PLAYING && this.weather.started) fx.showBanner(this.winter ? 'NEVASCA!' : 'CHUVA!');

    this.drawSky(pal, opts.time);
    if (this.weather.rain > 0) this.drawStormClouds(opts.time);
    this.drawHills(pal);
    this.drawTrees(pal);
    this.drawBiomeDecor(pal, opts.time);
    if (this.sky > 0.02) this.drawSkyClouds(opts.time);
    this.drawGround(engine, pal, opts.time);
    this.drawRecordSign(engine, opts.time);
    this.drawGators(engine, opts.time);
    const lvl = engine.track.level;
    for (const p of lvl.platforms) if (p.kind === 'copa') this.drawCanopy(p, pal);
    for (const p of lvl.platforms) if (p.kind === 'vitoria') this.drawLilyPads(p, opts.time);
    for (const p of lvl.platforms) if (p.kind !== 'copa' && p.kind !== 'vitoria') this.drawPlatform(p, pal);
    for (const v of lvl.vines) this.drawVine(v, engine, opts.time);
    for (const sp of lvl.springs) this.drawSpring(sp, engine.elapsed);
    for (const c of lvl.crates) {
      if (c.broken) continue;
      if (c.loot?.kind === 'mount') {
        // Montaria lá dentro: o caixote dá trancos (gira na quina de baixo e pula um pouco).
        const s = crateShake(c, opts.time);
        const px = this.sx((c.x0 + c.x1) / 2) + (s.angle > 0 ? 18 : -18);
        const py = this.sy(0);
        this.ctx.save();
        this.ctx.translate(px, py - s.hop);
        this.ctx.rotate(s.angle);
        this.ctx.translate(-px, -py);
        this.drawCrate(c, opts.time);
        this.ctx.restore();
        if (s.hop > 1) this.drawCrateDust(this.sx((c.x0 + c.x1) / 2), py, s.hop);
      } else this.drawCrate(c, opts.time);
    }
    for (const r of lvl.rocks) if (!r.broken) this.drawRock(r);
    const rx = this.runnerPos(engine).x;
    for (const l of lvl.logs) if (!l.broken) this.drawLog(l, rx, opts.time);
    for (const t of lvl.thorns) if (!t.broken) this.drawThorns(t);
    // O que fica dentro de uma toca ainda escondida não aparece.
    const hidden = (x: number, y: number) => y < 0 && lvl.burrowAt(x)?.opened === false;
    for (const f of lvl.fruits) if (!f.taken && !hidden(f.x, f.y)) this.drawFruit(f, opts.time);
    for (const u of lvl.powerups) if (!u.taken && !hidden(u.x, u.y)) this.drawItem(u.kind, this.sx(u.x), this.sy(u.y) + Math.sin(opts.time * 3 + u.x) * 2, opts.time);
    // Ema solta (esperando a capivara pular nela) ou fugindo.
    const m = engine.mount;
    if (m && m.state !== 'ridden') {
      const ex = this.sx(m.x);
      if (ex > this.viewL - 60 && ex < this.viewR + 60) {
        drawMount(this.ctx, m.animal, ex, this.sy(m.y), { run: m.x / 26, air: m.y > 0.5, lean: m.state === 'fleeing' ? 1 : 0.2 });
        // Solta: setinha chamando para pular nela.
        if (m.state === 'free' && m.t > 0.3) {
          const a = 0.6 + 0.4 * Math.sin(opts.time * 8);
          this.ctx.fillStyle = `rgba(255, 230, 120, ${a.toFixed(3)})`;
          const ay = this.sy(m.y) - 108 + Math.sin(opts.time * 6) * 3;
          this.ctx.beginPath();
          this.ctx.moveTo(ex - 8, ay);
          this.ctx.lineTo(ex + 8, ay);
          this.ctx.lineTo(ex, ay + 10);
          this.ctx.closePath();
          this.ctx.fill();
        }
      }
    }
    // Prêmios saindo dos caixotes (por cima do cenário, antes da capivara).
    for (const l of engine.loot) {
      if (l.kind === 'capim') this.drawFruit({ x: l.x, y: l.y, taken: false, risky: false }, opts.time);
      else this.drawItem(l.kind, this.sx(l.x), this.sy(l.y), opts.time);
    }
    this.drawPups(engine, opts.time);
    this.drawParticles(fx);
    this.drawRunner(engine, fx, opts.time, opts.beat ?? null);
    this.drawSwarm(engine, opts.time);
    if (pal.fireflies > 0.05) this.drawFireflies(pal, opts.time);
    if (pal.winter > 0.05) this.drawSnow(pal.winter * (1 - this.weather.rain), opts.time, false);
    if (pal.autumn > 0.05) this.drawLeaves(pal.autumn, opts.time);
    if (this.weather.rain > 0) {
      if (pal.winter >= 0.5) this.drawSnow(this.weather.rain, opts.time, true);
      else this.drawRain(fx);
    }
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
      // Pantanal é plano: os morros baixam com o peso dele.
      const h = (34 * Math.sin(wx / 210) + 18 * Math.sin(wx / 83 + 1.7) + 50) * (1 - 0.65 * this.bw.pantanal);
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
      // Cada árvore pertence a um bioma (na transição, elas vão trocando uma a uma).
      const tb = this.treeBiome(i);
      if (tb !== 'mata') {
        this.drawBiomeTree(tb, i, x, base, h, r1, r2, pal);
        continue;
      }
      // No inverno as araucárias vão tomando o lugar das árvores uma a uma (transição gradual).
      if (hash(i * 4.41 + 7) < pal.winter) {
        this.drawAraucaria(x, base, h + 25, 26 + r2 * 18, r1 > 0.5 ? pal.mid : pal.midDark, pal.midDark);
        continue;
      }
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
      // Primavera: ipês floridos (roxos e amarelos) aparecendo aos poucos.
      if (pal.spring > 0 && hash(i * 6.13 + 1) < pal.spring * 0.75) {
        ctx.fillStyle = hash(i * 3.3) < 0.5 ? COLORS.ipeRoxo : COLORS.ipeAmarelo;
        ctx.beginPath();
        for (let k = 0; k < 9; k++) {
          const fx2 = x + (hash(i * 9.1 + k) - 0.5) * cr * 2.2;
          const fy = base - h + (hash(i * 5.7 + k * 2) - 0.6) * cr * 1.2;
          ctx.moveTo(fx2 + 3.4, fy);
          ctx.arc(fx2, fy, 3.4, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      // Palmeira de vez em quando (não no frio).
      if (r2 > 0.82 && pal.winter < 0.3) {
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
    // Moitas na beira do caminho (no inverno, montinhos de geada).
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

  /**
   * Araucária (pinheiro-do-paraná): tronco reto e alto, galhos que sobem em
   * curva formando a copa achatada de "candelabro", com geada por cima.
   */
  /** Pantanal: lagoas com garças (e algumas voando). */
  private drawBiomeDecor(pal: Palette, time: number): void {
    const w = this.bw.pantanal;
    if (w <= 0.02) return;
    const ctx = this.ctx;
    const ground = this.sy(0);
    const par = 0.62;
    const sp = 210;
    const off = this.camX * par;
    const first = Math.floor((this.viewL + off) / sp) - 1;
    const last = Math.ceil((this.viewR + off) / sp) + 1;
    for (let i = first; i <= last; i++) {
      if (hash(i * 3.17 + 5) > w) continue;
      const x = i * sp - off + hash(i * 1.3) * 60;
      const y = ground - 5 + this.lift * 0.3;
      const pw = 50 + hash(i * 2.7) * 40;
      ctx.fillStyle = pal.water;
      ctx.beginPath();
      ctx.ellipse(x, y, pw, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pal.waterLight;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x - pw * 0.2, y - 1, pw * 0.4, 2, 0, 0, Math.PI);
      ctx.stroke();
      // Garça em pé na beira (às vezes duas).
      const n = hash(i * 9.1) > 0.6 ? 2 : 1;
      for (let k = 0; k < n; k++) this.drawEgret(x - pw * 0.3 + k * 26, y - 1, hash(i * 4.2 + k) > 0.5, time + i);
    }
    // Garças voando bem alto, devagar.
    ctx.globalAlpha = w;
    for (let k = 0; k < 3; k++) {
      const fx = ((time * 26 + k * 260 - this.camX * 0.1) % 900) + this.viewL - 60;
      const fy = this.sy(250 + k * 22) + Math.sin(time * 2 + k) * 4;
      const flap = Math.sin(time * 8 + k * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx - 12, fy - flap * 5);
      ctx.quadraticCurveTo(fx - 5, fy - 3, fx, fy);
      ctx.quadraticCurveTo(fx + 5, fy - 3, fx + 12, fy - flap * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Garça-branca em pé: pernas finas, pescoço em S, bico amarelo. */
  private drawEgret(x: number, y: number, flip: boolean, t: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-1, 0);
    ctx.lineTo(-1, -12);
    ctx.moveTo(2, 0);
    ctx.lineTo(1, -12);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, -16, 7, 4.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    const peck = Math.max(0, Math.sin(t * 0.9)) > 0.97 ? 6 : 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(4, -18);
    ctx.quadraticCurveTo(9, -22, 5, -26 + peck);
    ctx.quadraticCurveTo(3, -29 + peck, 7, -31 + peck);
    ctx.stroke();
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(7, -31 + peck);
    ctx.lineTo(13, -30 + peck);
    ctx.stroke();
    ctx.restore();
  }

  /** Bioma da árvore i (sorteio fixo comparado aos pesos do quadro). */
  private treeBiome(i: number): BiomeId {
    let r = hash(i * 8.83 + 2);
    for (const id of BIOMES.order) {
      r -= this.bw[id];
      if (r < 0) return id;
    }
    return 'mata';
  }

  /** Vegetação de Pantanal, Cerrado e Caatinga (mesmo lugar das árvores da mata). */
  private drawBiomeTree(b: BiomeId, i: number, x: number, base: number, h: number, r1: number, r2: number, pal: Palette): void {
    const ctx = this.ctx;
    if (b === 'pantanal') {
      if (r1 < 0.45) {
        // Carandá: palmeira alta e fina, leque de folhas.
        const ph = h + 30;
        ctx.strokeStyle = pal.midDark;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.quadraticCurveTo(x + 6, base - ph * 0.5, x + 2, base - ph);
        ctx.stroke();
        ctx.strokeStyle = pal.mid;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (let k = 0; k < 7; k++) {
          const a = -Math.PI + (k / 6) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x + 2, base - ph);
          ctx.lineTo(x + 2 + Math.cos(a) * 24, base - ph + Math.sin(a) * 16 - 2);
          ctx.stroke();
        }
      } else {
        // Capão de mato baixo e largo.
        ctx.fillStyle = r2 > 0.5 ? pal.mid : pal.midDark;
        ctx.beginPath();
        ctx.ellipse(x, base - 22, 40 + r2 * 20, 26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    if (b === 'cerrado') {
      if (r1 > 0.8) {
        this.drawCupinzeiro(x, base, 40 + r2 * 34);
        return;
      }
      // Árvore torta de casca grossa e copa rala (às vezes um ipê florido).
      const th = 50 + r2 * 50;
      ctx.strokeStyle = '#5a3d24';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x - 12, base - th * 0.5, x + 6, base - th);
      ctx.moveTo(x - 4, base - th * 0.55);
      ctx.lineTo(x + 16, base - th * 0.8);
      ctx.stroke();
      const ipe = hash(i * 3.71) < 0.35;
      ctx.fillStyle = ipe ? (hash(i * 1.9) < 0.6 ? COLORS.ipeAmarelo : '#e874b0') : r2 > 0.5 ? pal.mid : pal.midDark;
      ctx.beginPath();
      ctx.ellipse(x + 6, base - th - 6, 26 + r2 * 10, 14, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 18, base - th * 0.82, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Caatinga: mandacarus e arbustos secos sem folha.
    if (r1 < 0.55) this.drawMandacaru(x, base, 50 + r2 * 60, pal.mid);
    else {
      ctx.strokeStyle = '#7a6a55';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (hash(i * 2.2 + k) - 0.5) * 2.2;
        const l = 22 + hash(i * 4.4 + k) * 26;
        ctx.moveTo(x, base);
        ctx.lineTo(x + Math.cos(a) * l, base + Math.sin(a) * l);
      }
      ctx.stroke();
    }
  }

  /** Cupinzeiro: monte de terra vermelha, alto e cheio de calombos. */
  private drawCupinzeiro(x: number, base: number, h: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#9c4a28';
    ctx.beginPath();
    ctx.moveTo(x - h * 0.42, base);
    ctx.quadraticCurveTo(x - h * 0.36, base - h * 0.7, x - 4, base - h);
    ctx.quadraticCurveTo(x + 6, base - h * 1.04, x + 8, base - h * 0.86);
    ctx.quadraticCurveTo(x + h * 0.38, base - h * 0.5, x + h * 0.44, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x + h * 0.15, base - h * 0.4, h * 0.12, h * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(x - h * 0.15, base - h * 0.7, h * 0.08, h * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Mandacaru: cacto colunar com braços para cima. */
  private drawMandacaru(x: number, base: number, h: number, color: string): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x, base - h);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x, base - h * 0.45);
    ctx.lineTo(x - 16, base - h * 0.45);
    ctx.lineTo(x - 16, base - h * 0.75);
    ctx.moveTo(x, base - h * 0.6);
    ctx.lineTo(x + 15, base - h * 0.6);
    ctx.lineTo(x + 15, base - h * 0.85);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, base - 4);
    ctx.lineTo(x, base - h + 4);
    ctx.stroke();
  }

  private drawAraucaria(x: number, base: number, h: number, w: number, crown: string, trunk: string): void {
    const ctx = this.ctx;
    const top = base - h;
    ctx.fillStyle = trunk;
    ctx.fillRect(x - 3, top, 6, h);
    ctx.strokeStyle = trunk;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      if (k === 0) continue;
      ctx.moveTo(x, top + 14);
      ctx.quadraticCurveTo(x + k * w * 0.35, top + 10, x + k * w * 0.5, top - 4);
    }
    ctx.stroke();
    // Copa: tufos achatados na ponta dos galhos e no centro.
    ctx.fillStyle = crown;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      const cx = x + k * w * 0.5;
      const cy = top - 4 - (k === 0 ? 4 : 0);
      const rx = w * 0.32;
      ctx.moveTo(cx + rx, cy);
      ctx.ellipse(cx, cy, rx, 7, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    // Geada na copa.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) {
      const cx = x + k * w * 0.5;
      const cy = top - 9 - (k === 0 ? 4 : 0);
      ctx.moveTo(cx + w * 0.26, cy);
      ctx.ellipse(cx, cy, w * 0.26, 3, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /** Neve caindo: flocos lentos em zigue-zague (determinísticos pelo tempo, sem alocação). */
  private drawSnow(amount: number, time: number, heavy: boolean): void {
    const ctx = this.ctx;
    const W = this.viewR - this.viewL;
    const H = this.viewB - this.viewT;
    const n = Math.round((heavy ? 110 : 40) * amount);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = hash(i * 1.91);
      const b = hash(i * 7.33 + 2);
      const fall = 30 + b * 45 + (heavy ? 30 : 0);
      const y = this.viewT + ((b * H + time * fall) % (H + 10)) - 5;
      const drift = time * (heavy ? 40 : 15);
      const x = this.viewL + ((((a * W - drift + Math.sin(time * 1.3 + i) * 12) % W) + W) % W);
      const r = 1.2 + a * 1.8;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /** Outono: folhas secas caindo e rodopiando (poucas, para não atrapalhar a leitura). */
  private drawLeaves(amount: number, time: number): void {
    const ctx = this.ctx;
    const W = this.viewR - this.viewL;
    const H = this.viewB - this.viewT;
    const n = Math.round(22 * amount);
    for (let i = 0; i < n; i++) {
      const a = hash(i * 2.71 + 3);
      const b = hash(i * 8.17 + 5);
      const y = this.viewT + ((b * H + time * (35 + a * 25)) % (H + 10)) - 5;
      const x = this.viewL + ((((a * W - time * 45 + Math.sin(time * 1.7 + i) * 18) % W) + W) % W);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * (1.5 + a * 2) + i);
      ctx.fillStyle = i % 3 === 0 ? '#d9822b' : i % 3 === 1 ? '#c0502a' : '#e6b83a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Chão (trechos) e rio (buracos). */
  private drawGround(engine: Engine, pal: Palette, time: number): void {
    const ctx = this.ctx;
    const g0 = this.sy(0);
    // Rio por baixo de tudo: aparece nos buracos.
    const waterY = this.sy(WATER_Y);
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
      // Caatinga: chão rachado (linhas em zigue-zague na terra).
      if (this.bw.caatinga > 0.05) {
        ctx.strokeStyle = `rgba(70, 35, 12, ${(0.45 * this.bw.caatinga).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const cs = 38;
        const cf = Math.floor((a + this.camX) / cs);
        const ct = Math.ceil((b + this.camX) / cs);
        for (let i = cf; i <= ct; i++) {
          const cx = i * cs - this.camX + hash(i * 7.7) * 14;
          if (cx < a + 3 || cx > b - 3) continue;
          let px = cx;
          let py = g0 + 14;
          ctx.moveTo(px, py);
          for (let k = 0; k < 4; k++) {
            px += (hash(i * 3.1 + k) - 0.5) * 14;
            py += 6 + hash(i * 5.3 + k) * 6;
            ctx.lineTo(px, py);
          }
          ctx.moveTo(cx, g0 + 20);
          ctx.lineTo(cx + 12, g0 + 24);
        }
        ctx.stroke();
      }
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
    for (const b of engine.track.level.burrows) this.drawBurrow(b, pal, time);
  }

  /**
   * Toca: corte da terra mostrando o túnel (teto com raízes, chão batido),
   * o buraco de entrada tampado por folhas secas (escondido até alguém cair)
   * e o buraco de saída aberto, com um montinho de terra.
   */
  private drawBurrow(b: Burrow, pal: Palette, time: number): void {
    const ctx = this.ctx;
    const x0 = this.sx(b.x0);
    const x1 = this.sx(b.x1);
    if (x1 < this.viewL - 30 || x0 > this.viewR + 30) return;
    const g0 = this.sy(0);
    const roof = this.sy(b.roof);
    const floor = this.sy(b.floor);
    const hx = this.sx(b.holeEnd);
    const ex = this.sx(b.exitStart);
    const cave = mix('#2a1a10', pal.dirtDark, 0.25);
    if (!b.opened) {
      // Ainda escondida: parece chão comum com folhas secas por cima; só o
      // buraco de saída aparece (escuro, sem mostrar o túnel).
      const c0 = x0 - 5;
      const cw = hx - x0 + 10;
      ctx.fillStyle = pal.dirt;
      ctx.fillRect(c0, g0, cw, this.viewB - g0);
      ctx.fillStyle = pal.dirtDark;
      ctx.fillRect(c0, g0 + 12, cw, 3);
      ctx.fillStyle = pal.grass;
      ctx.fillRect(c0, g0 - 2, cw, 12);
      ctx.fillStyle = pal.grassEdge;
      ctx.fillRect(c0, g0 - 3, cw, 3);
      this.drawLeafCover(x0, hx, g0, false, b.x0);
      ctx.fillStyle = pal.dirt;
      ctx.fillRect(ex - 1, g0, x1 - ex + 2, this.viewB - g0);
      ctx.fillStyle = cave;
      ctx.beginPath();
      ctx.moveTo(ex, g0);
      ctx.lineTo(x1, g0);
      ctx.quadraticCurveTo(x1 - 4, g0 + 40, (ex + x1) / 2, g0 + 46);
      ctx.quadraticCurveTo(ex + 4, g0 + 40, ex, g0);
      ctx.fill();
      this.drawExitMound(x1, g0, pal);
      return;
    }
    // Terra embaixo do chão da toca (cobre o rio que fica por baixo de tudo).
    ctx.fillStyle = pal.dirt;
    ctx.fillRect(x0 - 2, floor, x1 - x0 + 4, this.viewB - floor);
    ctx.fillStyle = pal.dirtDark;
    ctx.fillRect(x0 - 2, floor + 14, x1 - x0 + 4, 3);
    // Interior: dos buracos desce desde a superfície; no túnel, do teto.
    ctx.fillStyle = cave;
    ctx.fillRect(x0, g0, hx - x0, floor - g0);
    ctx.fillRect(hx - 1, roof, ex - hx + 2, floor - roof);
    ctx.fillRect(ex, g0, x1 - ex, floor - g0);
    // Luz entrando pelos buracos.
    ctx.fillStyle = 'rgba(255, 236, 180, 0.10)';
    ctx.fillRect(x0, g0, hx - x0, floor - g0);
    ctx.fillRect(ex, g0, x1 - ex, floor - g0);
    // Paredes curvas nas pontas e chão batido.
    ctx.fillStyle = pal.dirtDark;
    ctx.fillRect(x0, g0, 4, floor - g0);
    ctx.fillRect(x1 - 4, g0, 4, floor - g0);
    ctx.fillStyle = mix(pal.dirt, '#000000', 0.18);
    ctx.fillRect(x0, floor - 4, x1 - x0, 6);
    // Teto: borda escura e raízes penduradas (balançam de leve).
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(hx, roof, ex - hx, 4);
    ctx.strokeStyle = mix(COLORS.branch, '#000000', 0.15);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const step = 38;
    const from = Math.ceil((b.holeEnd + 10) / step);
    const to = Math.floor((b.exitStart - 10) / step);
    for (let i = from; i <= to; i++) {
      const wx = i * step + hash(i * 2.7) * 14;
      const x = this.sx(wx);
      if (x < this.viewL - 10 || x > this.viewR + 10) continue;
      const len = 8 + hash(i * 5.1) * 18;
      const sway = Math.sin(time * 1.5 + i) * 2;
      ctx.moveTo(x, roof);
      ctx.quadraticCurveTo(x + 3, roof + len * 0.5, x + sway, roof + len);
    }
    ctx.stroke();
    // Pedrinhas no chão da toca.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = from; i <= to; i++) {
      const x = this.sx(i * step + 19 + hash(i * 3.9) * 10);
      ctx.fillRect(x, floor - 7, 4, 3);
    }
    // Entrada: folhas secas tampando (até alguém cair) ou rasgadas nas bordas.
    this.drawLeafCover(x0, hx, g0, b.opened, b.x0);
    this.drawExitMound(x1, g0, pal);
  }

  /** Montinho de terra do lado de fora da saída da toca. */
  private drawExitMound(x1: number, g0: number, pal: Palette): void {
    const ctx = this.ctx;
    ctx.fillStyle = pal.dirt;
    ctx.beginPath();
    ctx.ellipse(x1 + 10, g0 - 1, 16, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.dirtDark;
    ctx.beginPath();
    ctx.ellipse(x1 + 12, g0 - 3, 4, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Folhas secas e capim tampando o buraco escondido da toca. */
  private drawLeafCover(a: number, b: number, g0: number, opened: boolean, seed: number): void {
    const ctx = this.ctx;
    const w = b - a;
    const n = Math.max(4, Math.round(w / 9));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      // Aberto: só sobram folhas nas beiradas.
      if (opened && u > 0.2 && u < 0.8) continue;
      const h = hash(seed * 0.013 + i * 1.37);
      const x = a + u * w + (h - 0.5) * 6;
      const y = g0 - 1 + Math.sin(u * Math.PI) * (opened ? 0 : 3) + (h - 0.5) * 3;
      ctx.fillStyle = LEAF_COLORS[i % LEAF_COLORS.length];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((h - 0.5) * 1.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!opened) {
      // Fiapos de capim por cima para disfarçar.
      ctx.strokeStyle = 'rgba(120, 160, 60, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < n; i += 2) {
        const x = a + ((i + 0.3) / n) * w;
        ctx.moveTo(x, g0 + 1);
        ctx.lineTo(x + 3, g0 - 6);
      }
      ctx.stroke();
    }
  }

  /**
   * Copa de árvore: troncos que descem até o chão (mais escuros, "atrás" do
   * caminho de baixo) e uma massa de folhas com o topo plano onde se corre.
   * No inverno ganha geada por cima.
   */
  private drawCanopy(p: Platform, pal: Palette): void {
    const ctx = this.ctx;
    const x0 = this.sx(p.x0);
    const x1 = this.sx(p.x1);
    if (x1 < this.viewL - 40 || x0 > this.viewR + 40) return;
    const top = this.sy(p.y);
    const ground = this.sy(0);
    const w = x1 - x0;
    // Troncos.
    ctx.fillStyle = mix(COLORS.branch, pal.midDark, 0.45);
    const n = Math.max(1, Math.round(w / 110));
    for (let i = 0; i < n; i++) {
      const tx = x0 + ((i + 0.5) * w) / n;
      ctx.fillRect(tx - 7, top + 10, 14, ground - top - 10);
      ctx.beginPath();
      ctx.moveTo(tx - 7, top + 26);
      ctx.lineTo(tx - 26, top + 12);
      ctx.lineTo(tx - 20, top + 10);
      ctx.lineTo(tx, top + 20);
      ctx.fill();
    }
    // Folhagem: faixa com bolas por baixo e topo reto (onde se pisa).
    ctx.fillStyle = pal.midDark;
    ctx.beginPath();
    ctx.moveTo(x0 + 6, top);
    ctx.lineTo(x1 - 6, top);
    for (let x = x1; x >= x0; x -= 22) {
      const k = hash(Math.floor((x + this.camX) / 22) * 1.7);
      ctx.arc(x, top + 14, 14 + k * 8, 0, Math.PI);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.mid;
    ctx.beginPath();
    for (let x = x0 + 8; x <= x1 - 8; x += 18) {
      ctx.moveTo(x + 11, top + 3);
      ctx.arc(x, top + 3, 11, Math.PI, 0);
    }
    ctx.fill();
    ctx.fillRect(x0 + 2, top, w - 4, 8);
    // Borda de cima clara: mostra onde dá para pisar.
    ctx.fillStyle = pal.winter > 0.5 ? '#ffffff' : mix(pal.grassEdge, '#ffffff', 0.15);
    ctx.fillRect(x0 + 2, top - 2, w - 4, 3);
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
    const held = r.swinging && r.swAx === v.ax && !isDead(engine);
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

  /** Poeirinha no chão a cada tranco do caixote de montaria. */
  private drawCrateDust(cx: number, gy: number, hop: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(210, 185, 140, ${Math.min(0.6, hop / 5).toFixed(3)})`;
    for (const dx of [-22, -16, 16, 22]) {
      ctx.beginPath();
      ctx.arc(cx + dx, gy - 2, 2 + hop * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCrate(c: Crate, time: number): void {
    const ctx = this.ctx;
    const x0 = this.sx(c.x0);
    if (x0 > this.viewR + 10 || x0 + SIZES.crate.w < this.viewL - 10) return;
    const top = this.sy(c.top);
    const w = c.x1 - c.x0;
    const h = this.sy(0) - top;
    // Caixote com capim: tufos escapando pela tampa (desenhados atrás).
    if (c.loot?.kind === 'capim') {
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const bx = x0 + 6 + k * ((w - 12) / 4);
        const hgt = 7 + ((k * 37) % 5) + Math.sin(time * 3 + k) * 1.2;
        const lean = (k - 2) * 1.6;
        ctx.strokeStyle = COLORS.grassOutline;
        ctx.lineWidth = 3.6;
        ctx.beginPath();
        ctx.moveTo(bx, top + 3);
        ctx.lineTo(bx + lean, top - hgt);
        ctx.stroke();
        ctx.strokeStyle = k % 2 ? COLORS.grassDark : COLORS.grassBlade;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, top + 3);
        ctx.lineTo(bx + lean, top - hgt);
        ctx.stroke();
      }
    }
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
    // Capim aparecendo pelas frestas.
    if (c.loot?.kind === 'capim') {
      ctx.fillStyle = COLORS.grassBlade;
      ctx.fillRect(x0 + 5, top + h * 0.5 - 1, 5, 3);
      ctx.fillRect(x0 + w - 10, top + h * 0.35, 5, 3);
    }
    // Caixote de anta: folha escapando e pegada redonda de quatro dedos.
    if (c.loot?.kind === 'mount' && c.loot.animal === 'anta') {
      ctx.save();
      ctx.translate(x0 + w - 9, top);
      ctx.rotate(0.4 + Math.sin(time * 3) * 0.08);
      ctx.fillStyle = '#4f9a3a';
      ctx.beginPath();
      ctx.ellipse(0, -9, 5, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const fx = x0 + w / 2;
      const fy = top + h / 2 + 3;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 + 5, top + 5, w - 10, h - 10);
      ctx.fillStyle = '#5a3a1a';
      ctx.beginPath();
      ctx.ellipse(fx, fy + 3, 6, 4.5, 0, 0, Math.PI * 2);
      for (const [dx, dy] of [[-6, -5], [-2, -8], [2, -8], [6, -5]] as const) {
        ctx.moveTo(fx + dx + 2, fy + dy);
        ctx.arc(fx + dx, fy + dy, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // Caixote de tucano: pena preta escapando e um bico laranja pintado.
    if (c.loot?.kind === 'mount' && c.loot.animal === 'tucano') {
      ctx.save();
      ctx.translate(x0 + w - 8, top);
      ctx.rotate(0.5 + Math.sin(time * 3) * 0.08);
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.ellipse(0, -10, 4, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 + 5, top + 5, w - 10, h - 10);
      const bx = x0 + 8;
      const by = top + h / 2;
      ctx.fillStyle = '#ff8a1c';
      ctx.beginPath();
      ctx.moveTo(bx, by - 5);
      ctx.quadraticCurveTo(bx + 14, by - 7, bx + 21, by + 2);
      ctx.quadraticCurveTo(bx + 12, by + 3, bx, by + 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(bx - 1, by - 1, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Caixote de ema: pena escapando e pegada de três dedos carimbada.
    if (c.loot?.kind === 'mount' && c.loot.animal === 'ema') {
      ctx.save();
      ctx.translate(x0 + w - 8, top);
      ctx.rotate(0.5 + Math.sin(time * 3) * 0.08);
      ctx.fillStyle = '#c4b9a4';
      ctx.strokeStyle = '#7c7262';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -10, 4, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.lineTo(0, -20);
      ctx.stroke();
      ctx.restore();
      const fx = x0 + w / 2;
      const fy = top + h / 2 + 5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 + 5, top + 5, w - 10, h - 10);
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy - 12);
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - 7, fy - 9);
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + 7, fy - 9);
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx, fy + 4);
      ctx.stroke();
    }
    // Caixote premiado: cinta dourada e brilho piscando.
    if (c.loot?.kind === 'item') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.fillStyle = '#ffc21a';
      ctx.fillRect(x0 + 2, top + h / 2 - 3, w - 4, 6);
      ctx.strokeStyle = '#8a5a00';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 2, top + h / 2 - 3, w - 4, 6);
      ctx.fillStyle = `rgba(255, 230, 120, ${(0.25 + 0.35 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x0 + w / 2, top + h / 2, 9 + pulse * 3, 0, Math.PI * 2);
      ctx.fill();
      this.drawSparkle(x0 + w / 2, top + h / 2, 7 + pulse * 3, '#fffbe0');
      this.drawSparkle(x0 + w - 6, top + 5, 2 + 3 * Math.max(0, Math.sin(time * 4 + 1)), '#ffffff');
    }
  }

  /**
   * Tora rolando: vista de ponta (casca escura, anéis da madeira e rachaduras
   * girando) com poeira levantando atrás. Fora da tela, um "!" avisa na borda
   * direita, na altura dela.
   */
  private drawLog(l: Log, rx: number, time: number): void {
    // Parada (esperando a capivara chegar perto) ela fica fora da tela: não desenha.
    if (!l.rolling) return;
    const ctx = this.ctx;
    const wx = logX(l, rx);
    const x = this.sx(wx);
    const y = this.sy(l.r);
    if (x - l.r > this.viewR) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 14);
      const ax = this.viewR - 20;
      ctx.fillStyle = `rgba(255, 70, 70, ${(0.75 + 0.25 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ax, y - 15);
      ctx.lineTo(ax + 13, y + 9);
      ctx.lineTo(ax - 13, y + 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', ax, y + 7);
      return;
    }
    if (x + l.r < this.viewL - 20) return;
    const ang = -(l.x0 - wx) / l.r;
    // Poeira atrás (lado direito), enquanto rola.
    if (l.rolling) {
      ctx.fillStyle = 'rgba(200, 175, 130, 0.45)';
      for (let i = 0; i < 3; i++) {
        const ph = (time * 3 + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(x + l.r + 4 + ph * 18, this.sy(0) - 4 - ph * 8, 3 + ph * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Sombra.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, this.sy(0) + 1, l.r * 0.9, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    // Casca com nós.
    ctx.fillStyle = '#5b3a1e';
    ctx.beginPath();
    ctx.arc(0, 0, l.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a2f17';
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * l.r, Math.sin(a) * l.r, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Madeira e anéis.
    ctx.fillStyle = '#d9a86c';
    ctx.beginPath();
    ctx.arc(0, 0, l.r - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b07d45';
    ctx.lineWidth = 1.4;
    for (const k of [0.68, 0.42, 0.18]) {
      ctx.beginPath();
      ctx.arc(0, 0, (l.r - 4) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Rachaduras (mostram o giro).
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(l.r - 5, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(2.3) * (l.r - 7), Math.sin(2.3) * (l.r - 7));
    ctx.stroke();
    ctx.restore();
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

  /** Item especial no percurso, com brilho para chamar atenção. */
  private drawItem(kind: ItemKind, x: number, y: number, time: number): void {
    if (x < this.viewL - 20 || x > this.viewR + 20) return;
    if (kind === 'magnet') return this.drawMagnet(x, y, 1, time);
    const ctx = this.ctx;
    if (kind === 'golden') {
      // Fundo âmbar escuro com aro dourado pulsando: o dourado se destaca do verde.
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      ctx.fillStyle = 'rgba(110, 60, 0, 0.55)';
      ctx.strokeStyle = `rgba(255, 210, 63, ${(0.55 + 0.45 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 17 + pulse * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this.drawGoldenTuft(x, y + 3, 1.3, time);
      return;
    }
    if (kind === 'shield') {
      // Aro verde pulsando (como o ímã chama atenção) e o símbolo do escudo.
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      ctx.fillStyle = `rgba(160, 240, 140, ${(0.25 + 0.2 * pulse).toFixed(3)})`;
      ctx.strokeStyle = `rgba(200, 255, 170, ${(0.5 + 0.5 * pulse).toFixed(3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, 17 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this.drawShieldEmblem(x, y + 1, 1, time);
      return;
    }
    ctx.fillStyle = `rgba(255, 255, 210, ${(0.4 + 0.2 * Math.sin(time * 6)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'acai') this.drawAcai(x, y + 2, 1, time);
  }

  /** Tigela (cuia) de açaí com granola, rodela de banana e colherzinha. */
  private drawAcai(x: number, y: number, s: number, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    // Colher espetada atrás.
    ctx.strokeStyle = '#e9e4da';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(4, -2);
    ctx.lineTo(10, -14);
    ctx.stroke();
    // Açaí em cúpula.
    ctx.fillStyle = '#4a1259';
    ctx.strokeStyle = '#2a0733';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -1, 12.5, 7.5, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(210, 140, 240, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, -5, 4, 1.6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Granola e banana.
    ctx.fillStyle = '#d9a35a';
    for (const [gx, gy] of ACAI_GRANOLA) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff2b0';
    ctx.strokeStyle = '#d9b84a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-1, -7.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Cuia.
    ctx.fillStyle = '#8a4a1c';
    ctx.strokeStyle = '#4a2208';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-13.5, -1);
    ctx.quadraticCurveTo(-12, 10, 0, 10);
    ctx.quadraticCurveTo(12, 10, 13.5, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#b8743a';
    ctx.beginPath();
    ctx.moveTo(-9, 3);
    ctx.quadraticCurveTo(0, 6, 9, 3);
    ctx.stroke();
    // Brilhinho.
    const tw = Math.max(0, Math.sin(time * 4));
    if (tw > 0.3) this.drawSparkle(-11, -9, 3.5 * tw, '#ffffff');
    ctx.restore();
  }

  /** Nuvens na altura do voo (modo céu do tucano), em duas camadas de profundidade. */
  private drawSkyClouds(time: number): void {
    const ctx = this.ctx;
    const a = this.sky;
    for (const layer of [0, 1]) {
      const par = layer ? 0.75 : 0.45;
      const step = layer ? 260 : 330;
      const base = this.camX * par + time * (layer ? 30 : 12);
      const from = Math.floor((base + this.viewL) / step) - 1;
      const to = Math.ceil((base + this.viewR) / step) + 1;
      ctx.fillStyle = layer ? `rgba(255, 255, 255, ${(0.85 * a).toFixed(3)})` : `rgba(255, 255, 255, ${(0.55 * a).toFixed(3)})`;
      for (let i = from; i <= to; i++) {
        const x = i * step - base + hash(i * 4.1 + layer) * 120;
        const y = this.sy(70 + hash(i * 2.3 + layer * 7) * 170);
        const s = (layer ? 1 : 0.7) * (0.8 + hash(i * 6.7) * 0.6);
        ctx.beginPath();
        ctx.ellipse(x, y, 34 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x - 18 * s, y + 2, 18 * s, 8 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 20 * s, y + 3, 20 * s, 8 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(x + 4 * s, y - 7 * s, 18 * s, 10 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Placa "SEU RECORDE" no ponto da maior distância das partidas anteriores. */
  private drawRecordSign(engine: Engine, time: number): void {
    const m = engine.score.bestMetersAtStart;
    if (engine.state === GameState.READY || m < RECORD_SIGN_MIN) return;
    const x = this.sx(m * SCORING.unitsPerMeter);
    if (x < this.viewL - 60 || x > this.viewR + 60) return;
    const ctx = this.ctx;
    const g = this.sy(0);
    const passed = engine.passedSign;
    // Poste.
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x - 3, g - 58, 6, 58);
    // Placa (balança um pouco ao vento).
    ctx.save();
    ctx.translate(x, g - 58);
    ctx.rotate(Math.sin(time * 2) * 0.03);
    ctx.fillStyle = passed ? '#ffd23f' : '#c98a4b';
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-38, -30, 76, 34, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a240f';
    ctx.textAlign = 'center';
    ctx.font = '900 9px system-ui, sans-serif';
    ctx.fillText(passed ? 'RECORDE BATIDO!' : 'SEU RECORDE', 0, -17);
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.fillText(`${m} m`, 0, -3);
    ctx.restore();
    // Faixa quadriculada no chão, como uma linha de chegada.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#1d1d1d' : '#ffffff';
      ctx.fillRect(x - 6 + (i % 2) * 6, g - 2 + Math.floor(i / 2) * 3, 6, 3);
    }
  }

  /** Guarda o caminho da capivara (para a fila de filhotes andar por ele). */
  private recordTrail(engine: Engine, p: { x: number; y: number }): void {
    const t = this.trail;
    const last = t[t.length - 1];
    if (!last || p.x < last.x - 50) {
      t.length = 0;
      t.push({ x: p.x, y: p.y });
      return;
    }
    if (Math.hypot(p.x - last.x, p.y - last.y) >= 3) t.push({ x: p.x, y: p.y });
    while (t.length > 2 && t[0].x < p.x - 320) t.shift();
    void engine;
  }

  /** Ponto do caminho a `dist` unidades atrás da capivara. */
  private trailAt(dist: number): { x: number; y: number } | null {
    const t = this.trail;
    if (t.length < 2) return null;
    let left = dist;
    for (let i = t.length - 1; i > 0; i--) {
      const a = t[i];
      const b = t[i - 1];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= left) {
        const k = left / d;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      left -= d;
    }
    return t[0];
  }

  /** Filhotes que fogem para trás depois de uma batida. */
  scatterPups(n: number): void {
    for (let i = 0; i < n; i++) {
      const p = this.trailAt(30 + i * 27) ?? { x: this.camX + BODY.screenX - 20 * (i + 1), y: 0 };
      this.scattered.push({ x: p.x, y: Math.max(0, p.y), vx: -(90 + i * 35), t: 0, ph: i * 1.7 });
    }
  }

  /** Filhotes: os perdidos esperando no caminho, a fila atrás da capivara e os que fogem. */
  private drawPups(engine: Engine, time: number): void {
    const ctx = this.ctx;
    const S = 0.55;
    const pup = (x: number, y: number, run: number, pose: Pose, flip = false) => {
      ctx.save();
      ctx.translate(this.sx(x), this.sy(y));
      ctx.scale(flip ? -S : S, S);
      drawCapivara(ctx, 0, 0, { pose, run, squash: 0, time, tilt: 0 });
      ctx.restore();
    };
    // Esperando no caminho: virado para a mãe, com um coraçãozinho pulsando.
    for (const p of engine.track.level.pups) {
      if (p.taken) continue;
      const x = this.sx(p.x);
      if (x < this.viewL - 30 || x > this.viewR + 30) continue;
      const hop = Math.max(0, Math.sin(time * 6 + p.x)) * 3;
      pup(p.x, hop, 0, 'idle', true);
      const pulse = 1 + Math.sin(time * 7) * 0.15;
      this.drawHeart(x - 2, this.sy(0) - 34 - hop, 6 * pulse);
    }
    // A fila: cada filhote anda pelo caminho da mãe, um pouco mais atrás.
    if (!isDead(engine)) {
      for (let i = 0; i < engine.pups; i++) {
        const q = this.trailAt(30 + i * 27);
        if (!q) break;
        const air = q.y > 2;
        pup(q.x, q.y, (q.x / 14 + i) % (Math.PI * 2), air ? 'fall' : 'run');
      }
    }
    // Fugindo depois da batida (pulinhos para trás).
    for (const s of this.scattered) {
      const hop = Math.abs(Math.sin(s.t * 9 + s.ph)) * 10;
      ctx.globalAlpha = Math.max(0, 1 - s.t / 1.6);
      pup(s.x, s.y + hop, s.t * 20, 'run', true);
      ctx.globalAlpha = 1;
    }
  }

  /** Coraçãozinho (filhote esperando). */
  private drawHeart(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ff5a7a';
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.35);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
    ctx.fill();
  }

  /** Tufo de capim dourado (o do Jalapão), cintilando. */
  private drawGoldenTuft(x: number, y: number, s: number, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a4b00';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    for (const [dx, h, lean] of CAPIM) {
      ctx.moveTo(dx * 0.8, 7);
      ctx.quadraticCurveTo(dx + lean * 0.4, 7 - h * 0.7, dx + lean, 7 - h * 1.1);
    }
    ctx.stroke();
    for (let k = 0; k < CAPIM.length; k++) {
      const [dx, h, lean] = CAPIM[k];
      ctx.strokeStyle = k % 2 ? '#ffb000' : '#ffe066';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(dx * 0.8, 7);
      ctx.quadraticCurveTo(dx + lean * 0.4, 7 - h * 0.7, dx + lean, 7 - h * 1.1);
      ctx.stroke();
    }
    ctx.fillStyle = '#c96a00';
    ctx.fillRect(-5, 3.5, 10, 3.5);
    // Cintilância.
    for (let k = 0; k < 3; k++) {
      const a = time * 3 + k * 2.1;
      const tw = Math.max(0, Math.sin(a * 1.7));
      if (tw < 0.2) continue;
      this.drawSparkle(Math.cos(a) * 11, -6 + Math.sin(a * 1.3) * 8, 3.5 * tw, '#fffbe0');
    }
    ctx.restore();
  }

  /** Estrelinha de quatro pontas. */
  private drawSparkle(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  /** Capim dourado ativo: brilhinhos dourados subindo da capivara. */
  private drawGoldenOn(x: number, y: number, remaining: number, time: number, reduced: boolean): void {
    const ctx = this.ctx;
    const blink = remaining < 2 && Math.sin(time * 18) < 0 ? 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    const n = reduced ? 3 : 7;
    for (let k = 0; k < n; k++) {
      const ph = (time * 0.9 + k / n) % 1;
      const px = x + 4 + Math.sin(k * 2.4 + time * 2) * 22;
      const py = y - 6 - ph * 46;
      this.drawSparkle(px, py, 6 * (1 - ph) + 1.5, k % 2 ? '#ffd23f' : '#fff3a0');
    }
    ctx.restore();
  }

  /** Folha redonda de vitória-régia (borda levantada, recorte e flor rosa). */
  private drawLilyLeaf(x: number, y: number, r: number, time: number, alpha = 1): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.fillStyle = '#2f8f3a';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0.25, Math.PI * 2 - 0.25);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#a7e07a';
    ctx.lineWidth = Math.max(1.5, r * 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0.3, Math.PI * 2 - 0.3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20, 70, 25, 0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = 0.6 + k * 0.9;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
    }
    ctx.stroke();
    // Florzinha rosa.
    ctx.fillStyle = '#ff8fc0';
    const pr = r * 0.32;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = k * ((Math.PI * 2) / 5) + time * 0.5;
      ctx.moveTo(-r * 0.25 + Math.cos(a) * pr + pr * 0.5, -r * 0.2 + Math.sin(a) * pr);
      ctx.arc(-r * 0.25 + Math.cos(a) * pr, -r * 0.2 + Math.sin(a) * pr, pr * 0.5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(-r * 0.25, -r * 0.2, pr * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Folhas de vitória-régia boiando no rio (o escudo virou ponte). */
  private drawLilyPads(p: Platform, time: number): void {
    const ctx = this.ctx;
    const x0 = this.sx(p.x0);
    const x1 = this.sx(p.x1);
    if (x1 < this.viewL - 30 || x0 > this.viewR + 30) return;
    const y = this.sy(0) + 3;
    for (let x = x0 + 14; x <= x1 - 4; x += 30) {
      const bob = Math.sin(time * 3 + x * 0.1) * 1.5;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.scale(1, 0.35);
      ctx.fillStyle = '#2f8f3a';
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0.2, Math.PI * 2 - 0.2);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#a7e07a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0.25, Math.PI * 2 - 0.25);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Símbolo do escudo: brasão verde com borda clara e a vitória-régia no meio. */
  private drawShieldEmblem(x: number, y: number, s: number, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.quadraticCurveTo(6, -10, 12, -11);
      ctx.quadraticCurveTo(13, 4, 0, 14);
      ctx.quadraticCurveTo(-13, 4, -12, -11);
      ctx.quadraticCurveTo(-6, -10, 0, -13);
      ctx.closePath();
    };
    path();
    ctx.fillStyle = '#1f6e2c';
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#eafcd6';
    ctx.stroke();
    // Metade de cima mais clara (brilho).
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(-14, -14, 14, 30);
    ctx.restore();
    ctx.restore();
    this.drawLilyLeaf(x, y - 1 * s, 6.5 * s, time);
  }

  /**
   * Escudo ativo (como o ímã): aura verde pulsando, bolha em volta, anel de
   * folhinhas girando e o símbolo do escudo flutuando sobre a cabeça.
   */
  private drawShieldOn(x: number, y: number, time: number, reduced: boolean): void {
    const ctx = this.ctx;
    const cx = x + 4;
    const cy = y - 18;
    if (!this.shieldAuraCache) {
      const g = ctx.createRadialGradient(0, 0, 8, 0, 0, 56);
      g.addColorStop(0, 'rgba(220, 255, 200, 0.55)');
      g.addColorStop(0.6, 'rgba(120, 230, 120, 0.28)');
      g.addColorStop(1, 'rgba(120, 230, 120, 0)');
      this.shieldAuraCache = g;
    }
    const pulse = reduced ? 1 : 1 + Math.sin(time * 6) * 0.08;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = this.shieldAuraCache;
    ctx.fillRect(-60, -60, 120, 120);
    ctx.restore();
    // Bolha.
    const b = reduced ? 0 : Math.sin(time * 6) * 2;
    ctx.strokeStyle = 'rgba(190, 255, 160, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 34 + b, 28 + b, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(x - 8, y - 32, 10, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();
    // Folhinhas girando em volta.
    const spin = reduced ? 0 : time * 2.5;
    for (let i = 0; i < 5; i++) {
      const a = spin + (i * Math.PI * 2) / 5;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * 36, cy + Math.sin(a) * 29);
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = i % 2 ? '#7fd36a' : '#b6f08a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Símbolo do escudo sobre a cabeça.
    this.drawShieldEmblem(x + 8, y - 70 + (reduced ? 0 : Math.sin(time * 5) * 3), 1.15 * pulse, time);
  }

  /** Aura do ímã atrás da capivara (pisca nos 2 últimos segundos). */
  private drawMagnetAura(x: number, y: number, remaining: number, time: number, reduced: boolean): void {
    const ctx = this.ctx;
    const ending = remaining < 2;
    const blink = ending ? 0.35 + 0.65 * (Math.sin(time * 18) > 0 ? 1 : 0) : 1;
    const cx = x + 4;
    const cy = y - 18;
    if (!this.auraCache) {
      const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 58);
      g.addColorStop(0, 'rgba(255, 250, 190, 0.95)');
      g.addColorStop(0.5, 'rgba(255, 190, 40, 0.5)');
      g.addColorStop(1, 'rgba(255, 160, 40, 0)');
      this.auraCache = g;
    }
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.translate(cx, cy);
    const pulse = reduced ? 1 : 1 + Math.sin(time * 10) * 0.07;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = this.auraCache;
    ctx.fillRect(-62, -62, 124, 124);
    ctx.restore();
    // Estrelinhas girando em volta, mudando de cor (arco-íris).
    const spin = reduced ? 0 : time * 4;
    ctx.save();
    ctx.globalAlpha = blink;
    for (let i = 0; i < 6; i++) {
      const a = spin + (i * Math.PI * 2) / 6;
      const sx = cx + Math.cos(a) * 36;
      const sy = cy + Math.sin(a) * 26;
      ctx.fillStyle = `hsl(${Math.round((time * 220 + i * 60) % 360)}, 95%, 65%)`;
      star(ctx, sx, sy, 4.5, a * 2);
    }
    ctx.restore();
  }

  /** Ímã por cima da cabeça e raios elétricos até os capins sendo puxados. */
  private drawMagnetBeams(engine: Engine, wx: number, wy: number, x: number, y: number, time: number, reduced: boolean): void {
    const ctx = this.ctx;
    const mx = x + 8;
    const my = y - 62 + (reduced ? 0 : Math.sin(time * 6) * 3);
    let n = 0;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const f of engine.track.level.fruits) {
      if (n >= 8) break;
      if (f.taken) continue;
      const dx = f.x - wx;
      if (dx > MAGNET.reachAhead) break;
      if (dx < -MAGNET.reachBehind || Math.abs(f.y - wy - 17) > MAGNET.reachUp) continue;
      const fx2 = this.sx(f.x);
      const fy = this.sy(f.y);
      n++;
      // Raio em zigue-zague (parado com "menos movimento").
      ctx.beginPath();
      ctx.moveTo(mx, my + 6);
      const segs = 5;
      for (let k = 1; k < segs; k++) {
        const t = k / segs;
        const jx = reduced ? 0 : (Math.random() - 0.5) * 10;
        const jy = reduced ? 0 : (Math.random() - 0.5) * 10;
        ctx.lineTo(mx + (fx2 - mx) * t + jx, my + 6 + (fy - my - 6) * t + jy);
      }
      ctx.lineTo(fx2, fy);
      ctx.strokeStyle = 'rgba(120, 230, 255, 0.35)';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(235, 255, 255, 0.9)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    this.drawMagnet(mx, my, 0.8, time);
  }

  /** Ímã de ferradura (vermelho com pontas prateadas), com brilho para chamar atenção. */
  private drawMagnet(x: number, y: number, scale: number, time: number): void {
    if (x < this.viewL - 20 || x > this.viewR + 20) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (scale >= 1) {
      ctx.fillStyle = `rgba(255, 230, 120, ${(0.35 + 0.2 * Math.sin(time * 6)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(-0.35);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#7a1414';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, -1, 8, Math.PI, 0, true);
    ctx.lineTo(8, 8);
    ctx.moveTo(-8, -1);
    ctx.lineTo(-8, 8);
    ctx.stroke();
    ctx.strokeStyle = COLORS.magnet;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#e8eef5';
    ctx.fillRect(-11, 5, 6, 5);
    ctx.fillRect(5, 5, 6, 5);
    ctx.restore();
  }

  /** Jacaré de tocaia no rio: olhos e focinho na superfície, no meio de cada buraco. */
  private drawGators(engine: Engine, time: number): void {
    const ctx = this.ctx;
    const ground = engine.track.level.ground;
    const waterY = this.sy(WATER_Y);
    for (let i = 0; i + 1 < ground.length; i++) {
      const a = this.sx(ground[i].x1);
      const b = this.sx(ground[i + 1].x0);
      if (b < this.viewL || a > this.viewR || b - a < 50) continue;
      if (engine.track.level.burrowAt(ground[i].x1 + 1)) continue; // buraco da toca: sem jacaré
      const bote = this.gators.find(ground[i].x1);
      if (bote) {
        this.drawBote(bote, waterY, time);
        continue;
      }
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

  /**
   * Bote: o jacaré sai da água de boca aberta, fecha no alto ("nhac") e
   * volta. Só a parte acima da água aparece (recorte na linha d'água).
   */
  private drawBote(g: Gator, waterY: number, time: number): void {
    const ctx = this.ctx;
    const { rise, open } = boteShape(g);
    const h = g.reach * rise;
    const x = this.sx(g.x);
    // A boca fica no topo do bote; o corpo vem de baixo d'água.
    const mouthY = waterY - h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 90, this.viewT - 10, 180, waterY + 2 - this.viewT + 10);
    ctx.clip();
    // Corpo grosso saindo da água (levemente inclinado para a frente).
    const neckTop = mouthY + 30;
    ctx.fillStyle = COLORS.gator;
    ctx.beginPath();
    ctx.moveTo(x - 20, waterY + 40);
    ctx.quadraticCurveTo(x - 22, neckTop + 10, x - 13, neckTop);
    ctx.lineTo(x + 15, neckTop);
    ctx.quadraticCurveTo(x + 24, neckTop + 10, x + 22, waterY + 40);
    ctx.closePath();
    ctx.fill();
    // Barriga clara com escamas.
    ctx.fillStyle = COLORS.gatorBelly;
    ctx.fillRect(x - 7, neckTop + 6, 14, Math.max(0, waterY - neckTop - 4));
    ctx.strokeStyle = 'rgba(40, 60, 20, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let yy = neckTop + 12; yy < waterY; yy += 8) {
      ctx.moveTo(x - 7, yy);
      ctx.lineTo(x + 7, yy);
    }
    ctx.stroke();
    // Escamas nas costas (cristas).
    ctx.fillStyle = COLORS.gatorDark;
    for (let yy = neckTop + 8; yy < waterY - 4; yy += 11) {
      ctx.beginPath();
      ctx.moveTo(x - 19, yy);
      ctx.lineTo(x - 26, yy + 4);
      ctx.lineTo(x - 19, yy + 8);
      ctx.fill();
    }
    // Mandíbulas largas, abrindo para cima a partir do alto do pescoço.
    const hingeX = x + 1;
    const hingeY = neckTop + 2;
    const len = 46;
    for (const side of [-1, 1] as const) {
      ctx.save();
      ctx.translate(hingeX, hingeY);
      ctx.rotate(-Math.PI / 2 + side * open * 0.85);
      // Mandíbula: cunha larga e arredondada na ponta.
      ctx.fillStyle = side < 0 ? COLORS.gator : COLORS.gatorDark;
      ctx.beginPath();
      ctx.moveTo(0, -13 * side);
      ctx.quadraticCurveTo(len * 0.6, -11 * side, len, -5 * side);
      ctx.quadraticCurveTo(len + 5, -1 * side, len - 1, 1.5 * side);
      ctx.lineTo(0, 1.5 * side);
      ctx.closePath();
      ctx.fill();
      // Narina na ponta da de cima.
      if (side < 0) {
        ctx.fillStyle = COLORS.gatorDark;
        ctx.beginPath();
        ctx.arc(len - 5, -6, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Boca rosada por dentro e dentes.
      ctx.fillStyle = '#d96a7a';
      ctx.fillRect(4, -1 * side - (side > 0 ? 0 : 0), len - 8, 2.4 * side);
      ctx.fillStyle = '#fbfbef';
      for (let k = 0; k < 7; k++) {
        const tx = 6 + k * 5.6;
        ctx.beginPath();
        ctx.moveTo(tx, 1.5 * side);
        ctx.lineTo(tx + 2.8, 1.5 * side);
        ctx.lineTo(tx + 1.4, 6 * side);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    // Olhos grandes em cima da cabeça.
    ctx.fillStyle = COLORS.gator;
    ctx.beginPath();
    ctx.arc(x - 12, hingeY + 1, 7, 0, Math.PI * 2);
    ctx.arc(x + 13, hingeY + 1, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8f27a';
    ctx.beginPath();
    ctx.arc(x - 12, hingeY, 3.6, 0, Math.PI * 2);
    ctx.arc(x + 13, hingeY, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16260f';
    ctx.fillRect(x - 12.6, hingeY - 3, 1.3, 6);
    ctx.fillRect(x + 12.4, hingeY - 3, 1.3, 6);
    ctx.restore();
    // Água agitada em volta.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    const ripple = 26 + Math.sin(time * 12) * 3 + rise * 10;
    ctx.beginPath();
    ctx.ellipse(x, waterY + 1, ripple, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ───────────────────────────── personagens

  private drawRunner(engine: Engine, fx: Effects, time: number, beat: number | null): void {
    const r = engine.runner;
    const p = this.runnerPos(engine);
    const x0 = this.sx(p.x);
    let y = this.sy(p.y);
    let pose: Pose;
    let tilt = 0;
    if (isDead(engine)) {
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
    // Montada na ema: desenha a ema nos pés e a capivara sentada nas costas.
    const riding = engine.riding && !isDead(engine);
    const feetY = y;
    let x = x0;
    if (riding) {
      const animal = engine.mount!.animal;
      if (animal !== 'tucano') {
        drawMount(ctx, animal, x, feetY, { run: r.grounded ? (p.x / 24) % (Math.PI * 2) : 0, air: !r.grounded, lean: 0.6 });
        y -= MOUNT_SEAT_DRAW[animal];
        x -= 8;
        if (pose === 'run') pose = 'idle';
      } else if (!r.grounded && pose !== 'dash') pose = 'fall';
    }
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
    const under = p.y < 0 ? engine.track.level.burrowAt(p.x) : null;
    if (!isDead(engine) && (under || engine.track.level.groundAt(p.x))) {
      const base = under ? under.floor : 0;
      const h = Math.max(0, p.y - base);
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.06, 0.25 - h / 900).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x0 + 4, this.sy(base) + 1, Math.max(riding ? 22 : 6, 18 - h / 20), 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ímã ligado: aura dourada, estrelinhas de arco-íris girando e o ímã por cima
    // da cabeça soltando raios até cada capim que está puxando.
    const magnetOn = engine.magnet > 0 && !isDead(engine);
    if (magnetOn) this.drawMagnetAura(x, y, engine.magnet, time, fx.reducedMotion);
    const landing = r.landedAt < 0.14 ? 1 - r.landedAt / 0.14 : 0;
    if (magnetOn) this.drawMagnetBeams(engine, p.x, p.y, x, y, time, fx.reducedMotion);
    if (engine.shield && !isDead(engine)) this.drawShieldOn(x, y, time, fx.reducedMotion);
    if (engine.golden > 0 && !isDead(engine)) this.drawGoldenOn(x, y, engine.golden, time, fx.reducedMotion);
    drawCapivara(ctx, x, y, {
      pose,
      // Com o ímã, uma passada completa por batida do forró (duas patadas por tempo).
      run: engine.state === GameState.READY ? time * 12 : beat !== null ? (beat % 1) * Math.PI * 2 : (p.x / 28) % (Math.PI * 2),
      squash: fx.reducedMotion
        ? 0
        : Math.max(landing * 0.8, fx.pressPulse * 0.4, beat !== null && r.grounded ? Math.max(0, 1 - (beat % 1) * 6) * 0.22 : 0),
      time,
      tilt,
    });
    // Tucano carregando: por cima da capivara, batendo as asas (rápido segurando).
    if (riding && engine.mount!.animal === 'tucano') {
      const m = engine.mount!;
      const flap = time * (engine.holding ? 26 : 12);
      const blink = engine.tucanoTired || (m.t > MOUNT.tucanoTime - 2 && Math.sin(time * 18) < 0);
      drawTucano(ctx, x + 2, y - TUCANO_CARRY_DRAW, { flap, blink });
    }
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
    if (engine.swarm < SWARM.warn && !isDead(engine)) {
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
    const golden = engine.golden > 0;
    ctx.fillStyle = golden ? '#ffd23f' : COLORS.text;
    ctx.fillText(sc, W / 2, 40);
    // Capim dourado: selo "×2" ao lado dos pontos e o tempo que falta embaixo.
    if (golden) {
      const tw = ctx.measureText(sc).width;
      const bx = W / 2 + tw / 2 + 8;
      const blink = engine.golden < 2 && Math.sin(time * 18) < 0;
      this.drawGoldenTuft(bx + 8, 30, 0.75, time);
      ctx.font = '900 16px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(90, 45, 0, 0.7)';
      ctx.strokeText('×2', bx + 20, 38);
      ctx.fillStyle = blink ? '#ffffff' : '#ffd23f';
      ctx.fillText('×2', bx + 20, 38);
      ctx.textAlign = 'center';
      const k = Math.min(1, engine.golden / GOLDEN.duration);
      ctx.fillStyle = 'rgba(15, 20, 40, 0.45)';
      roundRect(ctx, W / 2 - 40, 63, 80, 6, 3);
      ctx.fill();
      ctx.fillStyle = blink ? '#ffffff' : '#ffc21a';
      roundRect(ctx, W / 2 - 40, 63, Math.max(6, 80 * k), 6, 3);
      ctx.fill();
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.fillStyle = COLORS.text;
    }
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
    // Ímã: ícone e barra do tempo que falta, embaixo do medidor.
    if (engine.magnet > 0) {
      const k = Math.min(1, engine.magnet / MAGNET.duration);
      const bx = mx - 4;
      const by = my + (full ? 44 : 24);
      this.drawMagnet(bx, by, 0.6, time);
      ctx.fillStyle = 'rgba(15, 20, 40, 0.45)';
      roundRect(ctx, bx + 12, by - 4, 90, 8, 4);
      ctx.fill();
      ctx.fillStyle = engine.magnet > 2 || Math.sin(time * 20) > 0 ? '#ff5a5a' : '#ffffff';
      roundRect(ctx, bx + 12, by - 4, Math.max(8, 90 * k), 8, 4);
      ctx.fill();
    }
    // Escudo ligado: o símbolo pulsando no canto (do lado do medidor).
    if (engine.shield && !isDead(engine)) {
      const p = 1 + Math.sin(time * 6) * 0.08;
      this.drawShieldEmblem(mx - 26, my, 0.72 * p, time);
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

    // Filhotes na fila: ícones e o bônus, embaixo dos metros.
    if (engine.pups > 0) {
      const n = engine.pups;
      const y0 = engine.golden > 0 ? 84 : 76;
      ctx.save();
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.translate(W / 2 - (n * 19) / 2 + i * 19 - 12, y0 + 6);
        ctx.scale(0.3, 0.3);
        drawCapivara(ctx, 0, 0, { pose: 'idle', run: 0, squash: 0, time, tilt: 0 });
        ctx.restore();
      }
      ctx.font = '800 11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      const txt = `+${Math.round(n * 25)}%`;
      const tx = W / 2 + (n * 19) / 2 - 2;
      ctx.strokeText(txt, tx, y0 + 4);
      ctx.fillStyle = '#ffd9a0';
      ctx.fillText(txt, tx, y0 + 4);
      ctx.restore();
      ctx.textAlign = 'center';
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
    // Ímã: moldura dourada pulsando nas bordas da tela.
    if (engine.magnet > 0 && !isDead(engine)) {
      const a = (fx.reducedMotion ? 0.25 : 0.22 + 0.12 * Math.sin(time * 8)) * (engine.magnet < 2 && Math.sin(time * 18) < 0 ? 0.3 : 1);
      const L = this.viewL;
      const T = this.viewT;
      const Wv = this.viewR - this.viewL;
      const Hv = this.viewB - this.viewT;
      ctx.strokeStyle = `rgba(255, 200, 60, ${a.toFixed(3)})`;
      ctx.lineWidth = 14;
      ctx.strokeRect(L + 7, T + 7, Wv - 14, Hv - 14);
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

/** Estrelinha de 4 pontas. */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? r : r * 0.38;
    const a = (i * Math.PI) / 4;
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Capivara caída (fim de partida ou tela de continuar). */
function isDead(engine: Engine): boolean {
  return engine.state === GameState.GAME_OVER || engine.state === GameState.CONTINUE;
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
