/**
 * Efeitos cosméticos do avião (não afetam a simulação). Tudo em pools de
 * tamanho fixo: zero alocação por quadro. Coordenadas de MUNDO (y para cima),
 * exceto as linhas de velocidade (coordenadas de arena).
 */

export interface Puff {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  /** 0 = fumaça branca de acrobacia, 1 = escapamento, 2 = faísca/destroço. */
  kind: number;
  color: string;
}

export interface Floater {
  active: boolean;
  x: number;
  y: number;
  text: string;
  sub: string;
  life: number;
  maxLife: number;
  big: boolean;
}

export interface SpeedLine {
  x: number;
  y: number;
  len: number;
  speed: number;
}

/** Primeiro item livre do pool (laço simples: sem closures por quadro). */
function freeOf(pool: Puff[]): Puff | null {
  for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
  return null;
}

const SMOKE = 260;
const PARTICLES = 140;
const FLOATERS = 6;
const LINES = 14;

export class Effects {
  readonly smoke: Puff[] = [];
  readonly particles: Puff[] = [];
  readonly floaters: Floater[] = [];
  readonly lines: SpeedLine[] = [];
  reducedMotion = false;
  shake = 0;
  flash = 0;
  /** Pulso de toque (0..1) para o "squash" do avião e o anel de toque. */
  pressPulse = 0;
  /** Brilho do combo (0..1). */
  comboGlow = 0;
  recordGlow = 0;
  private smokeTimer = 0;
  private exhaustTimer = 0;
  private lineRng = 11;

  constructor() {
    const puff = (): Puff => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, kind: 0, color: '#fff' });
    for (let i = 0; i < SMOKE; i++) this.smoke.push(puff());
    for (let i = 0; i < PARTICLES; i++) this.particles.push(puff());
    for (let i = 0; i < FLOATERS; i++)
      this.floaters.push({ active: false, x: 0, y: 0, text: '', sub: '', life: 0, maxLife: 1, big: false });
    for (let i = 0; i < LINES; i++) this.lines.push({ x: this.rand() * 360, y: this.rand() * 640, len: 0, speed: 0 });
  }

  private rand() {
    this.lineRng = (this.lineRng * 16807) % 2147483647;
    return this.lineRng / 2147483647;
  }

  clear(): void {
    for (const p of this.smoke) p.active = false;
    for (const p of this.particles) p.active = false;
    for (const f of this.floaters) f.active = false;
    this.shake = this.flash = this.pressPulse = this.comboGlow = this.recordGlow = 0;
  }

  /**
   * Fumaça de acrobacia: um rastro que fica no céu por alguns segundos e
   * desenha a trajetória (o loop vira um círculo de fumaça). Mais densa e
   * branca com o motor forte.
   */
  trail(x: number, y: number, phi: number, power: number, dt: number): void {
    this.smokeTimer += dt;
    const every = 1 / 70;
    while (this.smokeTimer >= every) {
      this.smokeTimer -= every;
      const p = freeOf(this.smoke);
      if (!p) break;
      const tail = 14;
      p.active = true;
      p.x = x - Math.cos(phi) * tail;
      p.y = y - Math.sin(phi) * tail;
      p.vx = 0;
      p.vy = 6;
      p.maxLife = p.life = this.reducedMotion ? 1.2 : 2.6;
      p.size = 3 + power * 2.2;
      p.kind = power > 0.55 ? 0 : 1;
      p.color = '';
    }
  }

  /** Baforadas do escapamento enquanto o motor está forte. */
  exhaust(x: number, y: number, phi: number, power: number, dt: number): void {
    if (this.reducedMotion || power < 0.3) return;
    this.exhaustTimer += dt * power;
    while (this.exhaustTimer > 1 / 30) {
      this.exhaustTimer -= 1 / 30;
      const p = freeOf(this.particles);
      if (!p) return;
      const a = phi + Math.PI + (Math.random() - 0.5) * 0.6;
      p.active = true;
      p.x = x + Math.cos(phi) * 6;
      p.y = y + Math.sin(phi) * 6 - 3;
      p.vx = Math.cos(a) * 60;
      p.vy = Math.sin(a) * 60;
      p.maxLife = p.life = 0.3;
      p.size = 1.5 + Math.random() * 1.5;
      p.kind = 1;
      p.color = Math.random() < 0.5 ? '#ffd27a' : '#ff9d5c';
    }
  }

  burst(x: number, y: number, count: number, speed: number, colors: readonly string[], life = 0.7, size = 2.5): void {
    const n = this.reducedMotion ? Math.ceil(count / 3) : count;
    let k = 0;
    for (const p of this.particles) {
      if (k >= n) break;
      if (p.active) continue;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * v;
      p.vy = Math.sin(a) * v;
      p.maxLife = p.life = life * (0.6 + Math.random() * 0.4);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.kind = 2;
      p.color = colors[k % colors.length];
      k++;
    }
  }

  float(x: number, y: number, text: string, sub = '', big = false): void {
    let f = this.floaters[0];
    for (const q of this.floaters) {
      if (!q.active) {
        f = q;
        break;
      }
      if (q.life < f.life) f = q;
    }
    f.active = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.sub = sub;
    f.big = big;
    f.maxLife = f.life = big ? 1.3 : 0.9;
  }

  update(dt: number, speedNorm: number): void {
    for (const p of this.smoke) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.y += p.vy * dt;
      p.size += dt * 5; // a fumaça se espalha
    }
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.kind === 2) p.vy -= 260 * dt; // destroços caem (y para cima)
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.life -= dt;
      if (f.life <= 0) f.active = false;
    }
    // Linhas de velocidade (arena): só acima de ~70% da velocidade máxima.
    const on = !this.reducedMotion && speedNorm > 0.68;
    for (const l of this.lines) {
      if (on) {
        if (l.len === 0) {
          l.x = 360 + this.rand() * 200;
          l.y = this.rand() * 640;
          l.speed = 900 + this.rand() * 700;
        }
        l.len = 30 + (speedNorm - 0.68) * 220;
        l.x -= l.speed * dt * speedNorm;
        if (l.x + l.len < -40) l.len = 0;
      } else l.len = 0;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.pressPulse = Math.max(0, this.pressPulse - dt * 6);
    this.comboGlow = Math.max(0, this.comboGlow - dt * 1.5);
    this.recordGlow = Math.max(0, this.recordGlow - dt * 0.6);
  }
}
