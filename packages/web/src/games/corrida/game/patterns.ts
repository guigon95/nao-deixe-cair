import { JUMP } from './config';
import type { Level } from './Level';
import type { Rng } from '../../../shared/random';

/**
 * Biblioteca de padrões de obstáculos.
 *
 * Cada padrão é escrito em SEGUNDOS a partir do seu início (`t`), não em
 * unidades: o `Builder` converte com a velocidade do momento (x = x0 + t·v).
 * Assim "um rio de 0,45 s" pede o mesmo pulo a 290 u/s e a 480 u/s — o que
 * muda com a velocidade é só o tempo de leitura da tela. Larguras e alturas
 * de pedras, caixotes e galhos são fixas (o pulo tem altura fixa).
 *
 * Todo padrão é validado por um planejador (`testing/planner.ts`) em várias
 * velocidades: existe uma sequência de toques que atravessa sem bater.
 */

export const SIZES = {
  rockSmall: { w: 34, h: 30 },
  rockBig: { w: 46, h: 50 },
  crate: { w: 36, h: 36 },
  thornsHeight: 24,
  spring: { w: 34, h: 12 },
  /** Altura do centro de uma fruta sobre os pés. */
  fruitLift: 17,
} as const;

/** Galhos: alturas usadas pelos padrões. */
export const PLATFORM_Y = { low: 78, mid: 118, high: 150 } as const;

export class Builder {
  /** Buracos (rio) dentro do padrão, em unidades de mundo. */
  readonly pits: Array<[number, number]> = [];

  constructor(
    readonly level: Level,
    readonly x0: number,
    /** Velocidade (u/s) usada para converter segundos em distância. */
    readonly v: number,
    readonly rng: Rng,
    /** Chance de colocar frutas fora do caminho seguro. */
    readonly risky = 0,
  ) {}

  X(t: number): number {
    return this.x0 + t * this.v;
  }

  rock(t: number, big = false): void {
    const s = big ? SIZES.rockBig : SIZES.rockSmall;
    const x = this.X(t);
    this.level.rocks.push({ x0: x, x1: x + s.w, top: s.h, variant: Math.floor(this.rng() * 3), broken: false });
  }

  crate(t: number): void {
    const x = this.X(t);
    this.level.crates.push({ x0: x, x1: x + SIZES.crate.w, top: SIZES.crate.h, broken: false, brokenAt: 0 });
  }

  thorns(t: number, dur: number): void {
    this.level.thorns.push({ x0: this.X(t), x1: this.X(t + dur), top: SIZES.thornsHeight, broken: false });
  }

  pit(t: number, dur: number): void {
    this.pits.push([this.X(t), this.X(t + dur)]);
  }

  platform(t0: number, t1: number, y: number): void {
    this.level.platforms.push({ x0: this.X(t0), x1: this.X(t1), y });
  }

  spring(t: number): void {
    const x = this.X(t);
    this.level.springs.push({ x0: x, x1: x + SIZES.spring.w, top: SIZES.spring.h, usedAt: -9 });
  }

  fruit(t: number, y: number, risky = false): void {
    this.level.fruits.push({ x: this.X(t), y: y + SIZES.fruitLift, taken: false, risky });
  }

  /** Fileira de `n` frutas de t0 a t1 na altura dos pés `y`. */
  row(t0: number, t1: number, y: number, n: number, risky = false): void {
    for (let i = 0; i < n; i++) this.fruit(n === 1 ? (t0 + t1) / 2 : t0 + ((t1 - t0) * i) / (n - 1), y, risky);
  }

  /**
   * Frutas ao longo da trajetória de um pulo que sai do chão (altura `base`)
   * em `takeoff`: segurando o tempo `hold` (s). Como a trajetória vem da
   * própria física, toda fruta do arco é alcançável.
   */
  arc(takeoff: number, hold: number, n: number, base = 0, risky = false): void {
    const air = airTime(hold);
    for (let i = 0; i < n; i++) {
      const tau = air * (0.18 + (0.64 * i) / Math.max(1, n - 1));
      this.fruit(takeoff + tau, base + jumpHeightAt(tau, hold), risky);
    }
  }

  /** Talvez coloque uma fruta arriscada (ex.: no meio de um rio, na altura de um pulo baixo). */
  maybeRisky(t: number, y: number): void {
    if (this.rng() < this.risky) this.fruit(t, y, true);
  }
}

// ───────── trajetória (mesma física do jogo, sem planar) ─────────

const TRAJ_DT = 1 / 240;

/** Altura dos pés `tau` s depois de pular segurando por `hold` s. */
export function jumpHeightAt(tau: number, hold: number): number {
  let y = 0;
  let vy = JUMP.jumpVelocity;
  let cut = false;
  for (let t = 0; t < tau; t += TRAJ_DT) {
    if (!cut && t >= Math.max(hold, JUMP.minCut) && vy > JUMP.releaseVelocity) {
      vy = JUMP.releaseVelocity;
      cut = true;
    }
    vy -= (vy > 0 ? JUMP.gravityUp : JUMP.gravityDown) * TRAJ_DT;
    y += vy * TRAJ_DT;
  }
  return Math.max(0, y);
}

/** Tempo no ar até voltar ao chão (s). */
export function airTime(hold: number): number {
  let y = 0;
  let vy = JUMP.jumpVelocity;
  let cut = false;
  let t = 0;
  while (t < 3) {
    if (!cut && t >= Math.max(hold, JUMP.minCut) && vy > JUMP.releaseVelocity) {
      vy = JUMP.releaseVelocity;
      cut = true;
    }
    vy -= (vy > 0 ? JUMP.gravityUp : JUMP.gravityDown) * TRAJ_DT;
    y += vy * TRAJ_DT;
    t += TRAJ_DT;
    if (y <= 0) return t;
  }
  return t;
}

/** Pulo "segurado" (até o topo) e toque curto. */
export const HOLD_FULL = 1;
export const HOLD_TAP = 0.08;

export interface Pattern {
  id: string;
  /** Nível mínimo de dificuldade (ver Difficulty.ts). */
  tier: number;
  weight: number;
  /** Monta o padrão e devolve a duração (s) até o fim do último obstáculo. */
  build(b: Builder): number;
}

/**
 * Padrões. Comentário de cada um: a ação esperada do jogador.
 * Tempos de referência (com os parâmetros atuais): pulo segurado ≈ 0,66 s no
 * ar e 160 u de altura; toque curto ≈ 0,46 s e ~85 u.
 */
export const PATTERNS: readonly Pattern[] = [
  {
    // Pulo baixo sobre uma pedra.
    id: 'pedra',
    tier: 0,
    weight: 4,
    build(b) {
      b.rock(0);
      b.arc(-0.2, HOLD_TAP, 3);
      return 0.12;
    },
  },
  {
    // Pedra alta: segurar um pouco mais (ou subir nela).
    id: 'pedrona',
    tier: 0,
    weight: 2,
    build(b) {
      b.rock(0, true);
      b.row(0.02, 0.08, SIZES.rockBig.h, 2);
      return 0.15;
    },
  },
  {
    // Caixote: pular por cima, pisar nele (quica) ou atravessar (atrasa).
    id: 'caixote',
    tier: 0,
    weight: 3,
    build(b) {
      b.crate(0);
      b.row(-0.02, 0.1, 62, 3);
      return 0.1;
    },
  },
  {
    // Riacho: pulo curto.
    id: 'riacho',
    tier: 0,
    weight: 3,
    build(b) {
      b.pit(0, 0.28);
      b.arc(-0.12, HOLD_TAP, 3);
      return 0.28;
    },
  },
  {
    // Rio médio: segurar o pulo.
    id: 'rio',
    tier: 1,
    weight: 3,
    build(b) {
      b.pit(0, 0.44);
      b.arc(-0.1, HOLD_FULL, 5);
      b.maybeRisky(0.22, 40);
      return 0.44;
    },
  },
  {
    // Moita de espinhos baixa e comprida.
    id: 'espinhos',
    tier: 1,
    weight: 3,
    build(b) {
      b.thorns(0, 0.3);
      b.arc(-0.12, HOLD_FULL, 4);
      return 0.3;
    },
  },
  {
    // Duas pedras: dois pulos separados.
    id: 'duas-pedras',
    tier: 1,
    weight: 3,
    build(b) {
      b.rock(0);
      b.rock(0.95);
      b.row(0.4, 0.62, 0, 3);
      return 1.0;
    },
  },
  {
    // Galho com frutas por cima de uma pedra: caminho alto (frutas) ou pular a pedra.
    id: 'galho',
    tier: 1,
    weight: 3,
    build(b) {
      b.platform(0.15, 1.15, PLATFORM_Y.low);
      b.row(0.3, 1.05, PLATFORM_Y.low, 5);
      b.rock(0.7);
      return 1.15;
    },
  },
  {
    // Caixotes em sequência: pule ou pise.
    id: 'caixotes',
    tier: 1,
    weight: 2,
    build(b) {
      b.crate(0);
      b.crate(0.55);
      b.row(0.2, 0.4, 70, 2);
      return 0.6;
    },
  },
  {
    // Flor-mola antes de um rio largo: encostar nela lança por cima.
    id: 'mola',
    tier: 1,
    weight: 2,
    build(b) {
      b.spring(0);
      b.pit(0.2, 0.75);
      // Arco das frutas: altura da mola (aprox.), metade do caminho.
      for (let i = 0; i < 5; i++) {
        const tau = 0.2 + i * 0.16;
        const vy = JUMP.springVelocity;
        const g = JUMP.gravityUp;
        b.fruit(0.05 + tau, Math.max(20, SIZES.spring.h + vy * tau - 0.5 * g * tau * tau));
      }
      return 0.95;
    },
  },
  {
    // Pedra e logo depois um rio.
    id: 'pedra-rio',
    tier: 2,
    weight: 3,
    build(b) {
      b.rock(0);
      b.pit(0.78, 0.36);
      b.arc(0.7, HOLD_FULL, 4);
      return 1.14;
    },
  },
  {
    // Duas pedras coladas: um pulo segurado passa pelas duas.
    id: 'pedras-juntas',
    tier: 2,
    weight: 2,
    build(b) {
      b.rock(0);
      b.rock(0.22, true);
      b.arc(-0.12, HOLD_FULL, 4);
      return 0.35;
    },
  },
  {
    // Rio largo: segurar o pulo e planar no fim.
    id: 'rio-largo',
    tier: 2,
    weight: 2,
    build(b) {
      b.pit(0, 0.7);
      b.arc(-0.08, HOLD_FULL, 5);
      return 0.7;
    },
  },
  {
    // Ponte de galho sobre o rio: pular no galho e pular de novo.
    id: 'ponte',
    tier: 2,
    weight: 2,
    build(b) {
      b.pit(0.1, 1.1);
      b.platform(0.42, 0.82, PLATFORM_Y.low);
      b.row(0.48, 0.76, PLATFORM_Y.low, 3);
      return 1.2;
    },
  },
  {
    // Pedra grande com caixote atrás: pular os dois de uma vez ou pisar no caixote.
    id: 'pedrona-caixote',
    tier: 2,
    weight: 2,
    build(b) {
      b.rock(0, true);
      b.crate(0.65);
      b.row(0.0, 0.12, SIZES.rockBig.h + 10, 2);
      return 0.75;
    },
  },
  {
    // Escada de galhos sobre espinhos: subir pelos galhos ou pular os espinhos.
    id: 'escada',
    tier: 3,
    weight: 2,
    build(b) {
      b.platform(0.1, 0.55, PLATFORM_Y.low);
      b.platform(0.8, 1.35, PLATFORM_Y.high);
      b.row(0.9, 1.3, PLATFORM_Y.high, 4);
      b.thorns(1.0, 0.3);
      return 1.35;
    },
  },
  {
    // Espinhos longos: pulo segurado + planar.
    id: 'espinhos-longos',
    tier: 3,
    weight: 2,
    build(b) {
      b.thorns(0, 0.62);
      b.arc(-0.1, HOLD_FULL, 5);
      return 0.62;
    },
  },
  {
    // Rio, pedra e rio: ritmo de três pulos.
    id: 'ritmo',
    tier: 3,
    weight: 2,
    build(b) {
      b.pit(0, 0.32);
      b.rock(0.95);
      b.pit(1.8, 0.32);
      b.row(1.25, 1.55, 0, 2);
      return 2.12;
    },
  },
  {
    // Dois galhos sobre um rio comprido: pular de galho em galho.
    id: 'galhos-no-rio',
    tier: 4,
    weight: 2,
    build(b) {
      b.pit(0.05, 1.75);
      b.platform(0.35, 0.7, PLATFORM_Y.low);
      b.platform(1.0, 1.35, PLATFORM_Y.mid);
      b.row(1.05, 1.3, PLATFORM_Y.mid, 3);
      b.maybeRisky(0.85, 20);
      return 1.8;
    },
  },
  {
    // Espinhos, pedra grande e caixote em sequência rápida.
    id: 'corredor',
    tier: 4,
    weight: 2,
    build(b) {
      b.thorns(0, 0.25);
      b.rock(0.85, true);
      b.crate(1.6);
      b.row(0.4, 0.6, 0, 2);
      return 1.7;
    },
  },
];

/** Escolhe um padrão permitido no nível, pelo peso, evitando repetir o anterior. */
export function pickPattern(rng: Rng, tier: number, previous: string | null): Pattern {
  const pool = PATTERNS.filter((p) => p.tier <= tier && p.id !== previous);
  // Padrões do nível recém-liberado aparecem um pouco mais (sensação de novidade).
  const w = (p: Pattern) => p.weight * (p.tier === tier && tier > 0 ? 1.6 : 1);
  let total = 0;
  for (const p of pool) total += w(p);
  let r = rng() * total;
  for (const p of pool) {
    r -= w(p);
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}
