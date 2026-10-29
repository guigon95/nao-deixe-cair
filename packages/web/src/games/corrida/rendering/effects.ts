/**
 * Efeitos cosméticos da Disparada (não afetam a simulação). Pools de tamanho
 * fixo: nenhuma alocação por quadro. Coordenadas de MUNDO (y para cima).
 */

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Sofre gravidade (lascas, terra) ou flutua (brilho, poeira). */
  heavy: boolean;
}

export interface Floater {
  active: boolean;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  big: boolean;
  color: string;
}

const PARTICLES = 160;
const FLOATERS = 8;

export class Effects {
  readonly particles: Particle[] = [];
  readonly floaters: Floater[] = [];
  reducedMotion = false;
  shake = 0;
  flash = 0;
  /** Brilho do medidor quando enche (0..1). */
  meterGlow = 0;
  /** Pulso de toque (0..1): "squash" da capivara. */
  pressPulse = 0;
  /** Faixa de aviso quando sobe o nível. */
  banner = '';
  bannerLife = 0;
  private dustTimer = 0;

  constructor() {
    for (let i = 0; i < PARTICLES; i++)
      this.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: '#fff', heavy: false });
    for (let i = 0; i < FLOATERS; i++)
      this.floaters.push({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1, big: false, color: '#fff' });
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    for (const f of this.floaters) f.active = false;
    this.shake = this.flash = this.meterGlow = this.pressPulse = this.bannerLife = 0;
  }

  private free(): Particle | null {
    for (let i = 0; i < this.particles.length; i++) if (!this.particles[i].active) return this.particles[i];
    return null;
  }

  /** Explosão de partículas a partir de um ponto. */
  burst(x: number, y: number, n: number, speed: number, colors: readonly string[], life = 0.5, size = 2.5, heavy = true): void {
    if (this.reducedMotion) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      const p = this.free();
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s * (heavy ? 1 : 0.6) + (heavy ? speed * 0.4 : 0);
      p.life = p.maxLife = life * (0.6 + Math.random() * 0.4);
      p.size = size * (0.6 + Math.random() * 0.7);
      p.color = colors[i % colors.length];
      p.heavy = heavy;
    }
  }

  /** Poeira dos pés correndo (só no chão). */
  dust(x: number, y: number, speed: number, dt: number): void {
    if (this.reducedMotion) return;
    this.dustTimer -= dt;
    if (this.dustTimer > 0) return;
    this.dustTimer = 0.07;
    const p = this.free();
    if (!p) return;
    p.active = true;
    p.x = x - 10;
    p.y = y + 2;
    p.vx = -speed * 0.15 - Math.random() * 30;
    p.vy = 20 + Math.random() * 30;
    p.life = p.maxLife = 0.35;
    p.size = 2.5 + Math.random() * 2;
    p.color = 'rgba(214, 190, 140, 0.8)';
    p.heavy = false;
  }

  float(x: number, y: number, text: string, big = false, color = '#ffffff'): void {
    let f = this.floaters.find((q) => !q.active);
    if (!f) {
      f = this.floaters[0];
      for (const q of this.floaters) if (q.life < f.life) f = q;
    }
    f.active = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.life = f.maxLife = big ? 1.1 : 0.7;
    f.big = big;
    f.color = color;
  }

  showBanner(text: string): void {
    this.banner = text;
    this.bannerLife = 2.2;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.heavy) p.vy -= 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y += 40 * dt;
      if (f.life <= 0) f.active = false;
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.meterGlow = Math.max(0, this.meterGlow - dt * 1.2);
    this.pressPulse = Math.max(0, this.pressPulse - dt * 6);
    this.bannerLife = Math.max(0, this.bannerLife - dt);
  }
}
