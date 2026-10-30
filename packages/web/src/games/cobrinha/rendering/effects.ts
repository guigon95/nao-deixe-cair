/** Partículas, textos flutuantes e tremidas do Fominha. Tudo em unidades da arena. */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  /** Nota de dinheiro (retângulo girando) em vez de bolinha. */
  bill: boolean;
  rot: number;
  vr: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  sub: string;
  life: number;
  color: string;
  big: boolean;
}

export interface Banner {
  text: string;
  sub: string;
  life: number;
}

const MAX_PARTICLES = 220;

export class Effects {
  particles: Particle[] = [];
  floats: Float[] = [];
  banner: Banner | null = null;
  shake = 0;
  flash = 0;
  reducedMotion = false;

  clear() {
    this.particles = [];
    this.floats = [];
    this.banner = null;
    this.shake = 0;
    this.flash = 0;
  }

  burst(x: number, y: number, n: number, speed: number, colors: string[], life = 0.6, size = 2.4, bills = 0) {
    const count = this.reducedMotion ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const bill = i < bills;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - (bill ? 40 : 0),
        life: life * (0.6 + Math.random() * 0.5),
        max: life,
        size: bill ? 5 + Math.random() * 2 : size * (0.6 + Math.random() * 0.7),
        color: bill ? '#5fcf78' : colors[i % colors.length],
        bill,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  float(x: number, y: number, text: string, sub = '', color = '#fff', big = false) {
    this.floats.push({ x, y, text, sub, life: big ? 1.3 : 0.9, color, big });
    if (this.floats.length > 8) this.floats.shift();
  }

  showBanner(text: string, sub = '') {
    this.banner = { text, sub, life: 1.8 };
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.bill ? 90 : 260) * dt;
      p.vx *= p.bill ? 0.97 : 0.99;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floats) {
      f.life -= dt;
      f.y -= (f.big ? 26 : 38) * dt;
    }
    this.floats = this.floats.filter((f) => f.life > 0);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max * 0.5)));
      ctx.fillStyle = p.color;
      if (p.bill) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2);
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
        ctx.fillStyle = '#2e8b47';
        ctx.fillRect(-p.size * 0.3, -p.size * 0.3, p.size * 0.6, p.size * 0.6);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      const a = Math.min(1, f.life * 2.5);
      ctx.globalAlpha = a;
      ctx.font = `900 ${f.big ? 22 : 16}px system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(10, 16, 40, 0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      if (f.sub) {
        ctx.font = '800 12px system-ui, sans-serif';
        ctx.strokeText(f.sub, f.x, f.y + 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(f.sub, f.x, f.y + 16);
      }
    }
    ctx.globalAlpha = 1;
  }
}
