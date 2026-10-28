import { PLANE } from './config';
import { Terrain } from './Terrain';
import type { Band, Obstacle, Ring, Segment } from './types';
import { randRange, type Rng } from '../../../shared/random';

/**
 * Gerador do mundo em trechos de largura fixa. Cada trecho tem um centro de
 * CORREDOR livre; entre os meios dos trechos o corredor é interpolado em
 * linha reta, formando uma faixa contínua. Obstáculos só nascem fora dela,
 * considerando toda a largura que ocupam (e o caminho dos pássaros). O
 * centro muda no máximo `maxShift` por trecho — uma rampa que o avião sobe
 * com folga —, então por construção sempre existe rota. O piloto
 * automático dos testes confirma isso em muitas sementes.
 * Pools fixos: zero alocação durante a partida.
 */

export const WORLD = {
  segmentWidth: 420,
  /** Começo sem obstáculos (decolagem / aprender o controle). */
  freeStart: 1600,
  /** Quantos trechos manter gerados à frente / atrás do avião. */
  ahead: 4,
  behind: 2,
  /** Folga mínima entre o chão e o fundo do corredor. */
  groundClear: 45,
  /** Teto dos corredores (abaixo do ar rarefeito). */
  corridorCeiling: 900,
  /** Distância extra entre o obstáculo e a borda do corredor. */
  edgeMargin: 10,
  pool: 64,
  rings: 16,
} as const;

export interface DifficultyParams {
  /** 0..1 */
  level: number;
  /** Altura do corredor livre. */
  gap: number;
  /** Variação máxima do centro do corredor entre trechos. */
  maxShift: number;
  /** Obstáculos por trecho (média). */
  density: number;
  /** Chance de pássaros (que se movem). */
  birdChance: number;
  /** Folga extra entre obstáculos e o corredor (grande no começo, some no fim). */
  clearance: number;
}

export interface DifficultyProfile {
  /** Distância (u) depois do início livre até a dificuldade máxima. */
  ramp: number;
  gap: readonly [number, number];
  maxShift: readonly [number, number];
  density: readonly [number, number];
  birdChance: readonly [number, number];
  clearance: number;
}

/** Física de voo (`?fisica=voo`): velocidade alta, rampa longa (~2,5 min). */
export const FLIGHT_DIFFICULTY: DifficultyProfile = {
  ramp: 36000,
  gap: [380, 200],
  maxShift: [80, 190],
  density: [1.3, 5.5],
  birdChance: [0.1, 0.5],
  clearance: 80,
};

/**
 * Física da bolinha (padrão): o avião anda a 150 → 285 u/s, então a rampa
 * é mais curta em distância. Calibrada com um jogador casual simulado.
 */
export const ARCADE_DIFFICULTY: DifficultyProfile = {
  ramp: 16000,
  gap: [300, 165],
  maxShift: [90, 210],
  density: [1.6, 5.5],
  birdChance: [0.15, 0.5],
  clearance: 50,
};

/** Curva de dificuldade por distância (u). */
export function difficultyAt(x: number, prof: DifficultyProfile = FLIGHT_DIFFICULTY): DifficultyParams {
  const level = Math.min(1, Math.max(0, (x - WORLD.freeStart) / prof.ramp));
  // Começo gentil (aprender a voar), meio crescendo, fim estável.
  const e = level * level * (3 - 2 * level);
  const lerp = (r: readonly [number, number]) => r[0] + (r[1] - r[0]) * e;
  return {
    level,
    gap: lerp(prof.gap),
    maxShift: lerp(prof.maxShift),
    density: lerp(prof.density),
    birdChance: lerp(prof.birdChance),
    clearance: prof.clearance * (1 - e),
  };
}

const START_CENTER = PLANE.startAltitude + 40;
/** 0..1 com mais chance perto de 0: obstáculos tendem a ficar rentes ao corredor. */
function near(rng: Rng): number {
  const r = rng();
  return r * r;
}

/** Alcance horizontal da patrulha dos pássaros (u). */
export const BIRD_RANGE = 150;

export class World {
  readonly terrain: Terrain;
  readonly obstacles: Obstacle[] = [];
  readonly rings: Ring[] = [];
  /** Trechos gerados (janela deslizante). */
  readonly segments: Segment[] = [];
  private rng: Rng;
  private nextSegX = 0;
  /** Centro do corredor do próximo trecho (sorteado um trecho antes). */
  private pendingCenter = START_CENTER;
  private ids = 0;
  private readonly band: Band = { bottom: 0, top: 0 };
  /** Teto dos corredores (u). Menor no modo "bolinha", que tem tela fixa. */
  readonly corridorCeiling: number;

  readonly profile: DifficultyProfile;

  constructor(rng: Rng, seed = 1, corridorCeiling: number = WORLD.corridorCeiling, profile: DifficultyProfile = FLIGHT_DIFFICULTY) {
    this.rng = rng;
    this.corridorCeiling = corridorCeiling;
    this.profile = profile;
    this.terrain = new Terrain(seed);
    for (let i = 0; i < WORLD.pool; i++)
      this.obstacles.push({
        active: false,
        id: 0,
        kind: 'balloon',
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        r: 0,
        top: 0,
        vx: 0,
        phase: 0,
        baseY: 0,
        grazed: false,
        variant: 0,
      });
    for (let i = 0; i < WORLD.rings; i++)
      this.rings.push({ active: false, id: 0, x: 0, y: 0, r: 0, passed: false, high: false, glow: 0 });
  }

  reset(rng: Rng, seed: number): void {
    this.rng = rng;
    this.terrain.reseed(seed);
    for (const o of this.obstacles) o.active = false;
    for (const r of this.rings) r.active = false;
    this.segments.length = 0;
    this.nextSegX = 0;
    this.pendingCenter = START_CENTER;
  }

  /** Gera trechos à frente, move pássaros e balões, recicla o que ficou para trás. */
  update(planeX: number, dt: number): void {
    const w = WORLD.segmentWidth;
    while (this.nextSegX < planeX + WORLD.ahead * w) this.generate(this.nextSegX);
    const cut = planeX - WORLD.behind * w;
    while (this.segments.length > 3 && this.segments[1].x1 < cut) this.segments.shift();
    for (const o of this.obstacles) {
      if (!o.active) continue;
      o.prevX = o.x;
      o.prevY = o.y;
      if (o.kind === 'bird') {
        // Patrulha: vai e volta num trecho fixo à esquerda do ponto de origem.
        o.phase += dt;
        o.x = o.top - BIRD_RANGE * (0.5 - 0.5 * Math.cos(o.phase * o.vx));
        o.y = o.baseY + Math.sin(o.phase * 2.5) * 6;
      } else if (o.kind === 'balloon') {
        o.phase += dt;
        o.y = o.baseY + Math.sin(o.phase * 0.8) * 3;
      }
      if (o.x < cut - 200) o.active = false;
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      if (r.passed) r.glow += dt;
      if (r.x < cut - 100) r.active = false;
    }
  }

  /** Centro do corredor interpolado em x, usando os trechos já gerados. */
  centerAt(x: number): { center: number; gap: number } | null {
    const segs = this.segments;
    if (segs.length === 0) return null;
    const w = WORLD.segmentWidth;
    let i = segs.length - 1;
    while (i > 0 && segs[i].x0 > x) i--;
    const s = segs[i];
    const mid = s.x0 + w / 2;
    const nb = x >= mid ? (segs[i + 1] ?? { center: this.pendingCenter, gap: s.gap }) : segs[i - 1];
    if (!nb) return { center: s.center, gap: s.gap };
    const t = Math.min(1, Math.abs(x - mid) / w);
    return { center: s.center + (nb.center - s.center) * t, gap: Math.min(s.gap, nb.gap) };
  }

  /** Faixa livre garantida em x. Retorna um objeto reaproveitado (não guarde a referência). */
  corridorAt(x: number): Band | null {
    const c = this.centerAt(x);
    if (!c) return null;
    this.band.bottom = c.center - c.gap / 2;
    this.band.top = c.center + c.gap / 2;
    return this.band;
  }

  /**
   * Envelope da faixa livre em [xa, xb]: o MENOR fundo e o MAIOR topo. Um
   * obstáculo abaixo de `bottom` ou acima de `top` fica fora do corredor em
   * todo o intervalo. A faixa é linear por partes com "quinas" no meio de
   * cada trecho, então basta olhar as pontas e as quinas dentro dele.
   */
  private bandRange(xa: number, xb: number): Band {
    let bottom = Infinity;
    let top = -Infinity;
    const w = WORLD.segmentWidth;
    const consider = (x: number) => {
      const c = this.centerAt(x)!;
      bottom = Math.min(bottom, c.center - c.gap / 2);
      top = Math.max(top, c.center + c.gap / 2);
    };
    consider(xa);
    consider(xb);
    for (let m = Math.ceil((xa - w / 2) / w) * w + w / 2; m < xb; m += w) consider(m);
    return { bottom, top };
  }

  /** Centro válido para o trecho que começa em x0, partindo do centro anterior. */
  private nextCenter(x0: number, from: number): number {
    const w = WORLD.segmentWidth;
    const d = difficultyAt(x0, this.profile);
    // Chão considerado até o meio dos vizinhos: o corredor interpolado nunca encosta no relevo.
    const ground = this.terrain.maxHeight(x0 - w / 2, x0 + w * 1.5);
    const lo = ground + WORLD.groundClear + d.gap / 2;
    const hi = this.corridorCeiling - d.gap / 2;
    const target = x0 < WORLD.freeStart ? from : from + randRange(this.rng, -d.maxShift, d.maxShift);
    return Math.min(hi, Math.max(lo, target));
  }

  private alloc(): Obstacle | null {
    for (const o of this.obstacles) if (!o.active) return o;
    return null;
  }

  private addRing(x: number, y: number, r: number, high: boolean): void {
    let ring: Ring | null = null;
    for (const q of this.rings) if (!q.active) { ring = q; break; }
    if (!ring) return;
    ring.active = true;
    ring.id = ++this.ids;
    ring.x = x;
    ring.y = y;
    ring.r = r;
    ring.high = high;
    ring.passed = false;
    ring.glow = 0;
  }

  private generate(x0: number): void {
    const w = WORLD.segmentWidth;
    const x1 = x0 + w;
    this.nextSegX = x1;
    const d = difficultyAt(x0, this.profile);
    const gap = d.gap;
    const center = this.segments.length === 0 ? this.nextCenter(x0, START_CENTER) : this.pendingCenter;
    this.segments.push({ x0, x1, center, gap });
    this.pendingCenter = this.nextCenter(x1, center);

    if (x0 < WORLD.freeStart) {
      // Primeiros anéis no caminho natural: ensinam que existem, sem obstáculos.
      if (x0 >= 800) this.addRing(x0 + w / 2, center, 34, false);
      return;
    }

    // Anel no corredor (às vezes) ou anel alto, que um loop alcança (mais raro).
    const rr = this.rng();
    if (rr < 0.35) this.addRing(x0 + w / 2, center + randRange(this.rng, -0.2, 0.2) * gap, 32, false);
    else if (rr < 0.5 && center + gap / 2 + 170 < this.corridorCeiling) this.addRing(x0 + w / 2, center + gap / 2 + 110, 30, true);

    const n = Math.floor(d.density + this.rng());
    const m = WORLD.edgeMargin;
    for (let i = 0; i < n; i++) {
      const o = this.alloc();
      if (!o) return;
      const ox = x0 + randRange(this.rng, 0.12, 0.88) * w;
      const pick = this.rng();
      const groundAt = this.terrain.height(ox);
      o.grazed = false;
      o.variant = Math.floor(this.rng() * 4);
      o.phase = this.rng() * 10;
      o.vx = 0;
      o.x = ox;
      const towerR = randRange(this.rng, 13, 18);
      const tb = this.bandRange(ox - towerR - 4, ox + towerR + 4);
      const towerRoom = tb.bottom - m - d.clearance - groundAt;
      if (pick < 0.3 && towerRoom > 70) {
        o.kind = 'tower';
        o.r = towerR;
        o.y = o.baseY = groundAt - 40; // a base fica enterrada no relevo
        // Torres altas são comuns: encostam quase no corredor.
        o.top = groundAt + Math.min(towerRoom, towerRoom - near(this.rng) * 90);
      } else if (pick < 0.3 + d.birdChance) {
        o.kind = 'bird';
        o.r = 11;
        // vx = frequência angular da patrulha; `top` guarda o x de origem.
        o.vx = randRange(this.rng, 0.4, 1.1);
        o.top = ox;
        // Fica fora do corredor em todo o caminho da patrulha.
        const b = this.bandRange(ox - BIRD_RANGE - o.r - 4, ox + o.r + 4);
        const top = b.top + o.r + 8 + m + d.clearance;
        const bottom = b.bottom - o.r - 8 - m - d.clearance;
        const groundMax = this.terrain.maxHeight(ox - BIRD_RANGE - o.r, ox + o.r);
        const below = bottom - groundMax > 60 && this.rng() < 0.45;
        o.baseY = below
          ? Math.max(groundMax + 45, bottom - near(this.rng) * 140)
          : top + near(this.rng) * 200;
        o.y = o.baseY;
      } else {
        o.kind = 'balloon';
        o.r = randRange(this.rng, 17, 23);
        const b = this.bandRange(ox - o.r, ox + o.r);
        o.baseY = b.top + o.r + 4 + m + d.clearance + near(this.rng) * 240;
        o.y = o.baseY;
      }
      o.active = true;
      o.id = ++this.ids;
      o.prevX = o.x;
      o.prevY = o.y;
    }
  }
}
