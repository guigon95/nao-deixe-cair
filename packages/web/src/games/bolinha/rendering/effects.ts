import { ARENA } from '../game/config';

/**
 * Efeitos visuais puramente cosméticos (não afetam a simulação).
 * Tudo usa pools de tamanho fixo: zero alocação por quadro.
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
}

export interface Floater {
  active: boolean;
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  big: boolean;
}

const PARTICLES = 160;
const TRAIL = 14;
const FLOATERS = 8;
const STARS = 42;

export class Effects {
  readonly particles: Particle[] = [];
  readonly floaters: Floater[] = [];
  /** Rastro: anel circular de posições Y (X é fixo, o rastro “escorre” para a esquerda). */
  readonly trailY = new Float32Array(TRAIL);
  readonly trailAge = new Float32Array(TRAIL);
  trailHead = 0;
  trailCount = 0;
  readonly stars: { x: number; y: number; z: number }[] = [];
  shake = 0;
  flash = 0;
  pressPulse = 0;
  recordGlow = 0;
  reducedMotion = false;
  /** Distância percorrida pelo cenário (u) — parallax da decoração de fundo. */
  scroll = 0;
  /** Relógio dos efeitos (s) — balanço de cipós, macacos e folhas. */
  clock = 0;
  private trailTimer = 0;
  private thrustTimer = 0;

  constructor() {
    for (let i = 0; i < PARTICLES; i++)
      this.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#fff' });
    for (let i = 0; i < FLOATERS; i++)
      this.floaters.push({ active: false, x: 0, y: 0, text: '', life: 0, maxLife: 1, big: false });
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < STARS; i++) this.stars.push({ x: rnd() * ARENA.width, y: rnd() * ARENA.height, z: 0.2 + rnd() * 0.8 });
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    for (const f of this.floaters) f.active = false;
    this.trailCount = 0;
    this.shake = 0;
    this.flash = 0;
    this.pressPulse = 0;
    this.recordGlow = 0;
  }

  /** Grava a posição atual da bolinha no rastro. */
  recordTrail(y: number, dt: number): void {
    this.trailTimer += dt;
    for (let i = 0; i < TRAIL; i++) this.trailAge[i] += dt;
    if (this.trailTimer < 1 / 60) return;
    this.trailTimer = 0;
    this.trailY[this.trailHead] = y;
    this.trailAge[this.trailHead] = 0;
    this.trailHead = (this.trailHead + 1) % TRAIL;
    this.trailCount = Math.min(TRAIL, this.trailCount + 1);
  }

  get trailLength() {
    return this.reducedMotion ? 5 : TRAIL;
  }

  emit(x: number, y: number, count: number, speed: number, colors: readonly string[], life = 0.6, size = 2.5): void {
    const n = this.reducedMotion ? Math.ceil(count / 3) : count;
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= n) break;
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
      p.color = colors[spawned % colors.length];
      spawned++;
    }
  }

  /** Faíscas do “propulsor” sob a bolinha enquanto o jogador segura. */
  thrust(x: number, y: number, r: number, dt: number): void {
    if (this.reducedMotion) return;
    this.thrustTimer += dt;
    while (this.thrustTimer > 1 / 45) {
      this.thrustTimer -= 1 / 45;
      for (const p of this.particles) {
        if (p.active) continue;
        p.active = true;
        p.x = x - 3 + Math.random() * 6;
        p.y = y + r * 0.8;
        p.vx = -40 - Math.random() * 40;
        p.vy = 60 + Math.random() * 60;
        p.maxLife = p.life = 0.28;
        p.size = 1.6 + Math.random() * 1.4;
        p.color = Math.random() < 0.5 ? '#ffb347' : '#ffe08a';
        break;
      }
    }
  }

  float(x: number, y: number, text: string, big = false): void {
    const f = this.floaters.find((f) => !f.active) ?? this.floaters[0];
    f.active = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.big = big;
    f.maxLife = f.life = big ? 1.6 : 0.8;
  }

  update(dt: number, scrollSpeed: number): void {
    this.scroll += scrollSpeed * dt;
    this.clock += dt;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy += 300 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const f of this.floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= (f.big ? 18 : 40) * dt;
      if (f.life <= 0) f.active = false;
    }
    for (const s of this.stars) {
      s.x -= scrollSpeed * 0.25 * s.z * dt;
      if (s.x < -2) s.x += ARENA.width + 4;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.pressPulse = Math.max(0, this.pressPulse - dt * 5);
    this.recordGlow = Math.max(0, this.recordGlow - dt * 0.6);
  }
}
