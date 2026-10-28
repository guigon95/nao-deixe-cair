import { ARENA, FLIGHT, PLANE } from '../game/config';
import type { Engine } from '../game/Engine';
import { maxLevelSpeed } from '../game/Plane';
import { GameState, type Obstacle, type Ring } from '../game/types';
import { computeLayout, type Layout } from '../../../shared/layout/layout';
import { Camera } from './Camera';
import type { Effects } from './effects';

export const COLORS = {
  skyTop: '#2a6fdb',
  skyBottom: '#ffc49b',
  skyHighTop: '#0e1b4d',
  hillFar: '#a9c4e4',
  hillNear: '#8fb7c4',
  ground: '#2f8f5b',
  groundDark: '#1f6b43',
  grassEdge: '#7be08f',
  plane: '#ff7a45',
  planeDark: '#c2502a',
  wing: '#ffd23f',
  ring: '#ffd23f',
  ringPassed: '#7dffb0',
  balloon: ['#ff5577', '#47c4ff', '#b77dff', '#ffb347'],
  tower: '#e8eef8',
  towerStripe: '#ff5d5d',
  bird: '#2a2f45',
  text: '#ffffff',
  combo: '#ffd23f',
  danger: '#ff5577',
} as const;

const VMAX = maxLevelSpeed();

/** Dica dos controles (texto, distância do fundo da arena). */
const HINT = [
  ['Segure: sobe', 132],
  ['Solte: mergulha', 110],
  ['2 toques: LOOP!', 88],
] as const;

/** Morros de fundo: parallax, cor, amplitude, base. */
const HILLS = [
  [0.2, COLORS.hillFar, 34, 70],
  [0.4, COLORS.hillNear, 26, 30],
] as const;

interface DrawOptions {
  showHud: boolean;
  time: number;
}

/**
 * Desenha o mundo com Canvas 2D. A arena lógica 360×640 é escalada sem
 * esticar; as sobras laterais mostram mais céu (não há tarja preta).
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  layout: Layout = computeLayout(1, 1);
  private dpr = 1;
  /** Limites visíveis em coordenadas de arena (inclui as sobras laterais). */
  private viewL = 0;
  private viewR: number = ARENA.width;
  private viewT = 0;
  private viewB: number = ARENA.height;
  private skyCache: (CanvasGradient | undefined)[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.dpr = dpr;
    this.layout = computeLayout(cssWidth, cssHeight);
    this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    const l = this.layout;
    this.viewL = -l.offsetX / l.scale;
    this.viewR = (cssWidth - l.offsetX) / l.scale;
    this.viewT = -l.offsetY / l.scale;
    this.viewB = (cssHeight - l.offsetY) / l.scale;
    this.skyCache = [];
  }

  /** Atualiza a câmera (chamar uma vez por quadro, antes de desenhar). */
  follow(engine: Engine, dt: number, snap = false): void {
    const p = engine.plane;
    const a = engine.alpha;
    const x = p.prevX + (p.x - p.prevX) * a;
    const y = p.prevY + (p.y - p.prevY) * a;
    const alt = y - engine.world.terrain.height(x);
    this.camera.update(x, y, p.phi, p.speed / VMAX, alt, dt, snap);
  }

  draw(engine: Engine, fx: Effects, opts: DrawOptions): void {
    const ctx = this.ctx;
    const l = this.layout;
    const p = engine.plane;
    const s = l.scale * this.dpr;
    let shx = 0;
    let shy = 0;
    if (fx.shake > 0 && !fx.reducedMotion) {
      shx = (Math.random() - 0.5) * 10 * fx.shake;
      shy = (Math.random() - 0.5) * 10 * fx.shake;
    }
    ctx.setTransform(s, 0, 0, s, (l.offsetX + shx * l.scale) * this.dpr, (l.offsetY + shy * l.scale) * this.dpr);

    const a = engine.alpha;
    const px = p.prevX + (p.x - p.prevX) * a;
    const py = p.prevY + (p.y - p.prevY) * a;
    const phi = p.prevPhi + (p.phi - p.prevPhi) * a;

    this.drawSky(py, p.air);
    this.drawHills();
    this.drawSmoke(fx);
    for (const r of engine.world.rings) if (r.active) this.drawRing(r, 'back');
    for (const o of engine.world.obstacles) if (o.active) this.drawObstacle(o, engine.alpha, opts.time);
    this.drawTerrain(engine);
    this.drawParticles(fx);
    if (engine.state !== GameState.GAME_OVER) this.drawPlane(px, py, phi, p.throttle, fx, opts.time, engine.scheme.roll, p.stall);
    for (const r of engine.world.rings) if (r.active) this.drawRing(r, 'front');
    this.drawSpeedLines(fx);
    this.drawFloaters(fx);
    if (opts.showHud) this.drawHud(engine, fx, opts.time);
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(fx.flash * (fx.reducedMotion ? 0.25 : 0.55)).toFixed(3)})`;
      ctx.fillRect(this.viewL, this.viewT, this.viewR - this.viewL, this.viewB - this.viewT);
    }
  }

  // ---------------------------------------------------------------- cenário

  private drawSky(planeY: number, air: number): void {
    const ctx = this.ctx;
    // Quanto mais alto, mais escuro o céu (e o ar rarefeito aparece).
    const h = Math.min(1, Math.max(0, (planeY - 500) / (FLIGHT.thinAirEnd - 500)));
    // Gradiente em cache por faixa de altura (32 níveis): nada é criado a cada quadro.
    const q = Math.round(h * 32);
    let g = this.skyCache[q];
    if (!g) {
      g = ctx.createLinearGradient(0, this.viewT, 0, this.viewB);
      g.addColorStop(0, mix(COLORS.skyTop, COLORS.skyHighTop, q / 32));
      g.addColorStop(1, mix(COLORS.skyBottom, '#6f8fd8', (q / 32) * 0.8));
      this.skyCache[q] = g;
    }
    ctx.fillStyle = g;
    ctx.fillRect(this.viewL, this.viewT, this.viewR - this.viewL, this.viewB - this.viewT);
    // Sol com parallax quase nulo.
    const sunX = 270 - ((this.camera.x * 0.01) % 400);
    const sunY = 140 + (this.camera.y - 300) * 0.04;
    ctx.fillStyle = 'rgba(255, 236, 190, 0.85)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 236, 190, 0.18)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 44, 0, Math.PI * 2);
    ctx.fill();
    // Nuvens decorativas em duas camadas de parallax (posições determinísticas, sem colisão).
    this.drawCloudLayer(0.25, 0.55, 260, 3);
    this.drawCloudLayer(0.5, 0.8, 340, 7);
    if (air < 0.95) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = Math.min(0.9, (1 - air) * 1.2);
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Ar rarefeito: o motor perde força', ARENA.width / 2, 92);
      ctx.globalAlpha = 1;
    }
  }

  private drawCloudLayer(parallax: number, alpha: number, spacing: number, salt: number): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const z = cam.zoom * (0.6 + parallax * 0.4);
    const left = cam.x * parallax - (ARENA.width * 0.5) / z - spacing;
    const first = Math.floor(left / spacing);
    const count = Math.ceil((this.viewR - this.viewL) / z / spacing) + 3;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = first; i < first + count; i++) {
      const r1 = hash(i * 7 + salt);
      const r2 = hash(i * 13 + salt * 3);
      const wx = i * spacing + r1 * spacing * 0.6;
      const wy = 300 + r2 * 900;
      const x = ARENA.width * 0.34 + (wx - cam.x * parallax) * z;
      const y = ARENA.height * 0.5 - (wy - cam.y * parallax) * z;
      if (x < this.viewL - 80 || x > this.viewR + 80 || y < this.viewT - 40 || y > this.viewB + 40) continue;
      const w = (40 + r1 * 50) * z;
      ctx.beginPath();
      ctx.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2);
      ctx.ellipse(x - w * 0.45, y + w * 0.08, w * 0.5, w * 0.24, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.5, y + w * 0.1, w * 0.45, w * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Morros de fundo, claros e enevoados (perspectiva atmosférica), sempre
   * logo acima do horizonte do chão — não competem com o relevo de verdade.
   */
  private drawHills(): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const z = cam.zoom;
    for (const [par, color, amp, lift] of HILLS) {
      // Linha de base: entre o chão na tela e a parte de baixo da arena (parallax vertical).
      const horizon = Math.min(this.viewB, cam.sy(0) * (1 - par) + ARENA.height * 0.8 * par) - lift * z;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(this.viewL, this.viewB);
      for (let x = this.viewL; x <= this.viewR + 12; x += 12) {
        const wx = (x - ARENA.width * 0.34) / z + cam.x * par;
        const h = amp * (0.6 * Math.sin(wx / 230) + 0.4 * Math.sin(wx / 97 + 1.3));
        ctx.lineTo(x, horizon - (h + amp) * z);
      }
      ctx.lineTo(this.viewR + 12, this.viewB);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawTerrain(engine: Engine): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const t = engine.world.terrain;
    ctx.beginPath();
    ctx.moveTo(this.viewL - 4, this.viewB + 4);
    for (let x = this.viewL - 4; x <= this.viewR + 8; x += 6) ctx.lineTo(x, cam.sy(t.height(cam.wx(x))));
    ctx.lineTo(this.viewR + 8, this.viewB + 4);
    ctx.closePath();
    ctx.fillStyle = COLORS.ground;
    ctx.fill();
    // Faixa mais escura abaixo da grama.
    ctx.save();
    ctx.clip();
    ctx.fillStyle = COLORS.groundDark;
    ctx.beginPath();
    ctx.moveTo(this.viewL - 4, this.viewB + 4);
    for (let x = this.viewL - 4; x <= this.viewR + 8; x += 6) ctx.lineTo(x, cam.sy(t.height(cam.wx(x))) + 22 * cam.zoom);
    ctx.lineTo(this.viewR + 8, this.viewB + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = COLORS.grassEdge;
    ctx.lineWidth = 3 * cam.zoom;
    ctx.beginPath();
    for (let x = this.viewL - 4; x <= this.viewR + 8; x += 6) {
      const y = cam.sy(t.height(cam.wx(x)));
      if (x === this.viewL - 4) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawObstacle(o: Obstacle, a: number, time: number): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const z = cam.zoom;
    const wx = o.prevX + (o.x - o.prevX) * a;
    const wy = o.prevY + (o.y - o.prevY) * a;
    const x = cam.sx(wx);
    if (x < this.viewL - 60 || x > this.viewR + 60) return;
    const y = cam.sy(wy);
    if (o.kind === 'balloon') {
      const r = o.r * z;
      ctx.strokeStyle = 'rgba(40,40,60,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.lineTo(x, y + r * 2.1);
      ctx.stroke();
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(x - r * 0.25, y + r * 2.05, r * 0.5, r * 0.35);
      ctx.fillStyle = COLORS.balloon[o.variant % COLORS.balloon.length];
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.92, r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.25, r * 0.38, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === 'bird') {
      const r = o.r * z;
      const flap = Math.sin(time * 14 + o.phase * 3);
      // Vira para o lado em que está patrulhando.
      const dir = Math.sin(o.phase * o.vx) >= 0 ? -1 : 1;
      ctx.strokeStyle = COLORS.bird;
      ctx.lineWidth = 2.4 * z;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - r * 1.3, y - flap * r * 0.8);
      ctx.quadraticCurveTo(x - r * 0.5, y - r * 0.2, x, y + r * 0.1);
      ctx.quadraticCurveTo(x + r * 0.5, y - r * 0.2, x + r * 1.3, y - flap * r * 0.8);
      ctx.stroke();
      ctx.fillStyle = COLORS.bird;
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.15, r * 0.5, r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.moveTo(x + dir * r * 0.5, y + r * 0.1);
      ctx.lineTo(x + dir * r * 0.85, y + r * 0.2);
      ctx.lineTo(x + dir * r * 0.5, y + r * 0.3);
      ctx.fill();
    } else {
      const left = cam.sx(o.x - o.r);
      const w = o.r * 2 * z;
      const top = cam.sy(o.top);
      const bottom = cam.sy(o.baseY);
      ctx.fillStyle = COLORS.tower;
      ctx.fillRect(left, top, w, bottom - top);
      ctx.fillStyle = COLORS.towerStripe;
      const band = 22 * z;
      for (let yy = top; yy < bottom; yy += band * 2) ctx.fillRect(left, yy, w, Math.min(band, bottom - yy));
      // Luz piscando no topo.
      const on = Math.sin(time * 4 + o.phase) > 0;
      ctx.fillStyle = on ? '#ff3344' : '#7a1a22';
      ctx.beginPath();
      ctx.arc(left + w / 2, top - 3 * z, 4 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Anel visto de lado: a metade de trás antes do avião e a da frente depois (profundidade). */
  private drawRing(r: Ring, half: 'back' | 'front'): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const x = cam.sx(r.x);
    if (x < this.viewL - 60 || x > this.viewR + 60) return;
    const y = cam.sy(r.y);
    const ry = r.r * cam.zoom;
    const rx = ry * 0.32;
    const fade = r.passed ? Math.max(0, 1 - r.glow * 1.5) : 1;
    if (fade <= 0) return;
    ctx.globalAlpha = fade;
    ctx.lineWidth = (half === 'front' ? 5 : 4) * cam.zoom;
    ctx.strokeStyle = r.passed ? COLORS.ringPassed : half === 'front' ? COLORS.ring : '#b8901a';
    ctx.beginPath();
    if (half === 'back') ctx.ellipse(x, y, rx + (r.passed ? r.glow * 20 : 0), ry + (r.passed ? r.glow * 30 : 0), 0, Math.PI / 2, (Math.PI * 3) / 2);
    else ctx.ellipse(x, y, rx + (r.passed ? r.glow * 20 : 0), ry + (r.passed ? r.glow * 30 : 0), 0, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    if (half === 'front' && r.high && !r.passed) {
      ctx.fillStyle = COLORS.ring;
      ctx.font = `800 ${Math.round(11 * Math.max(0.8, cam.zoom))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('×2', x, y - ry - 6);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- avião e efeitos

  private drawSmoke(fx: Effects): void {
    const ctx = this.ctx;
    const cam = this.camera;
    for (const p of fx.smoke) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const x = cam.sx(p.x);
      if (x < this.viewL - 20 || x > this.viewR + 20) continue;
      ctx.globalAlpha = (p.kind === 0 ? 0.75 : 0.35) * t * t;
      ctx.fillStyle = p.kind === 0 ? '#ffffff' : '#e9eef7';
      ctx.beginPath();
      ctx.arc(x, cam.sy(p.y), p.size * cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawParticles(fx: Effects): void {
    const ctx = this.ctx;
    const cam = this.camera;
    for (const p of fx.particles) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const sz = p.size * cam.zoom;
      ctx.fillRect(cam.sx(p.x) - sz / 2, cam.sy(p.y) - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  private drawPlane(wx: number, wy: number, phi: number, power: number, fx: Effects, time: number, roll: number, stall: number): void {
    const ctx = this.ctx;
    const cam = this.camera;
    const z = cam.zoom * (PLANE.length / 30);
    ctx.save();
    ctx.translate(cam.sx(wx), cam.sy(wy));
    // Estol: tremidinha legível. Tonneau (esquema B): achata no eixo da cabine.
    const wobble = stall > 0.3 && !fx.reducedMotion ? Math.sin(time * 40) * 0.06 * stall : 0;
    ctx.rotate(-phi + wobble);
    const squash = 1 + fx.pressPulse * 0.08;
    const rollScale = roll > 0 ? Math.cos(roll * Math.PI * 2) : 1;
    ctx.scale(z * squash, z * (2 - squash) * rollScale);
    // Asa de trás (mais escura), fuselagem, cauda, cabine, asa da frente, hélice.
    ctx.fillStyle = '#d9a800';
    roundRect(ctx, -3, -2, 9, 4, 2);
    ctx.fillStyle = COLORS.plane;
    roundRect(ctx, -15, -4, 28, 8, 4);
    ctx.fillStyle = COLORS.planeDark;
    ctx.beginPath();
    ctx.moveTo(-15, -3);
    ctx.lineTo(-20, -10);
    ctx.lineTo(-14, -10);
    ctx.lineTo(-9, -3);
    ctx.fill();
    ctx.fillRect(-18, -1, 6, 3);
    ctx.fillStyle = 'rgba(200, 235, 255, 0.95)';
    ctx.beginPath();
    ctx.ellipse(1, -4.5, 4.5, 3.2, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = COLORS.wing;
    roundRect(ctx, -5, -1, 11, 3.5, 1.6);
    ctx.fillStyle = '#333a';
    ctx.beginPath();
    ctx.arc(14, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // Hélice: borrão que cresce com a potência.
    const spin = time * (20 + power * 60);
    const len = 8.5 * Math.abs(Math.sin(spin));
    ctx.fillStyle = `rgba(230, 236, 255, ${0.35 + power * 0.4})`;
    ctx.fillRect(14.5, -len, 1.6, len * 2);
    if (power > 0.4) {
      ctx.fillStyle = `rgba(230, 236, 255, ${0.12 * power})`;
      ctx.beginPath();
      ctx.ellipse(15.3, 0, 1.6, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSpeedLines(fx: Effects): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const l of fx.lines) {
      if (l.len <= 0) continue;
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x + l.len, l.y);
    }
    ctx.stroke();
  }

  private drawFloaters(fx: Effects): void {
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.textAlign = 'center';
    for (const f of fx.floaters) {
      if (!f.active) continue;
      const t = 1 - f.life / f.maxLife;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.55 : 1.15 - Math.min(0.15, (t - 0.15) * 0.6);
      const x = Math.min(this.viewR - 70, Math.max(this.viewL + 70, cam.sx(f.x)));
      const y = Math.min(this.viewB - 60, Math.max(this.viewT + 120, cam.sy(f.y) - 36 - t * 30));
      ctx.globalAlpha = Math.min(1, (f.life / f.maxLife) * 2.2);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pop, pop);
      ctx.font = `900 ${f.big ? 26 : 18}px system-ui, -apple-system, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(20, 25, 60, 0.75)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.big ? COLORS.combo : COLORS.text;
      ctx.fillText(f.text, 0, 0);
      if (f.sub) {
        ctx.font = '800 13px system-ui, sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeText(f.sub, 0, 18);
        ctx.fillStyle = COLORS.text;
        ctx.fillText(f.sub, 0, 18);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(engine: Engine, fx: Effects, time: number): void {
    const ctx = this.ctx;
    const sc = engine.score;
    ctx.textAlign = 'center';
    ctx.font = '900 34px system-ui, -apple-system, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(20, 25, 60, 0.55)';
    const text = String(sc.score);
    ctx.strokeText(text, ARENA.width / 2, 56);
    ctx.fillStyle = fx.recordGlow > 0 ? mix('#ffffff', '#ffd23f', fx.recordGlow) : '#ffffff';
    ctx.fillText(text, ARENA.width / 2, 56);
    // Combo: multiplicador + barra do tempo restante para encadear.
    if (sc.multiplier > 1) {
      const left = Math.max(0, 1 - sc.sinceLast / 4);
      const pulse = 1 + fx.comboGlow * 0.25;
      ctx.save();
      ctx.translate(ARENA.width / 2, 84);
      ctx.scale(pulse, pulse);
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText(`COMBO ×${sc.multiplier}`, 0, 0);
      ctx.fillStyle = COLORS.combo;
      ctx.fillText(`COMBO ×${sc.multiplier}`, 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(20, 25, 60, 0.45)';
      roundRect(ctx, ARENA.width / 2 - 50, 92, 100, 5, 2.5);
      ctx.fillStyle = left < 0.3 ? COLORS.danger : COLORS.combo;
      roundRect(ctx, ARENA.width / 2 - 50, 92, 100 * left, 5, 2.5);
    }
    // Dica dos controles nos primeiros segundos (some depois do primeiro loop).
    if (engine.elapsed < 6 && sc.loops === 0 && engine.scheme.id === 'c') {
      ctx.globalAlpha = Math.min(1, (6 - engine.elapsed) / 1.2);
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20, 25, 60, 0.6)';
      ctx.fillStyle = '#ffffff';
      for (const [txt, y] of HINT) {
        ctx.strokeText(txt, ARENA.width / 2, ARENA.height - y);
        ctx.fillText(txt, ARENA.width / 2, ARENA.height - y);
      }
      ctx.globalAlpha = 1;
    }
    // Aviso de estol: legível, piscando.
    if (engine.plane.stall > 0.4 && !engine.plane.onGround && Math.sin(time * 12) > -0.3) {
      ctx.font = '900 16px system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20, 25, 60, 0.7)';
      ctx.strokeText('ESTOL! solte e mergulhe', ARENA.width / 2, ARENA.height - 70);
      ctx.fillStyle = COLORS.danger;
      ctx.fillText('ESTOL! solte e mergulhe', ARENA.width / 2, ARENA.height - 70);
    }
  }
}

// ---------------------------------------------------------------- utilitários

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w <= 0 || h <= 0) return;
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

/** Hash determinístico 0..1 (posições das nuvens, sem estado). */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const mixCache = new Map<string, string>();
/** Mistura duas cores #rrggbb (com cache: sem criar strings novas a cada quadro em regime). */
function mix(a: string, b: string, t: number): string {
  const q = Math.round(Math.min(1, Math.max(0, t)) * 32);
  const key = a + b + q;
  let v = mixCache.get(key);
  if (v) return v;
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = q / 32;
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  v = `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  mixCache.set(key, v);
  return v;
}
