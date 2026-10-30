import { JUMP, LOG, NEST, SNAKE, TOCA } from './config';
import type { Level } from './Level';
import type { BiomeId } from './biome';
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
  /** Altura do centro de um capim sobre os pés. */
  fruitLift: 17,
} as const;

/** Altura onde os cipós ficam presos (acima do topo da tela). */
export const VINE_Y = 300;

/**
 * Caminho alto pelas copas das árvores (como as copas do Banana Kong): só se
 * chega lá pelo cipó do começo do padrão; o caminho de baixo continua
 * seguro (chão contínuo, só caixotes), então cair de uma copa nunca mata.
 */
export const CANOPY = {
  /** Altura do "chão" das copas. */
  y: 200,
  /** Cipó de entrada: altura de onde pende e comprimento. */
  vineY: 330,
  vineLen: 175,
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
    /** Chance de colocar capins fora do caminho seguro. */
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

  /** Cupinzeiro (Cerrado): alto (58), dá para subir nele. */
  cupim(t: number): void {
    const x = this.X(t);
    this.level.rocks.push({ x0: x, x1: x + 40, top: 58, variant: 0, broken: false, kind: 'cupim' });
  }

  /** Mandacaru (Caatinga): cacto alto e estreito (espinhos). */
  mandacaru(t: number): void {
    const x = this.X(t);
    this.level.thorns.push({ x0: x, x1: x + 22, top: 46, broken: false, kind: 'mandacaru' });
  }

  /** Sucuri pendurada em t (s): dá o bote quando a capivara chega perto. */
  snake(t: number): void {
    const ax = this.X(t);
    this.level.snakes.push({ ax, by: SNAKE.branch, trig: ax - SNAKE.lead * this.v, broken: false, struck: false });
  }

  /** Ninho de marimbondo que cai na frente da capivara e fica no chão em t (s). */
  nest(t: number): void {
    const x = this.X(t);
    this.level.nests.push({ x, trig: x - NEST.lead * this.v, fall: NEST.fall * this.v, broken: false, dropping: false, landed: false });
  }

  /** Poça de lama de t0 a t1 (s). */
  mud(t0: number, t1: number): void {
    this.level.muds.push({ x0: this.X(t0), x1: this.X(t1) });
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

  platform(t0: number, t1: number, y: number, kind: 'galho' | 'copa' = 'galho'): void {
    this.level.platforms.push({ x0: this.X(t0), x1: this.X(t1), y, kind });
  }

  spring(t: number): void {
    const x = this.X(t);
    this.level.springs.push({ x0: x, x1: x + SIZES.spring.w, top: SIZES.spring.h, usedAt: -9 });
  }

  /**
   * Toca: buraco escondido de t0 a t1 (cai quem passa correndo), túnel por
   * baixo da terra e buraco de saída de t2 a t3, que lança de volta para cima.
   */
  burrow(t0: number, t1: number, t2: number, t3: number): void {
    this.pit(t0, t1 - t0);
    this.pit(t2, t3 - t2);
    this.level.burrows.push({ x0: this.X(t0), holeEnd: this.X(t1), exitStart: this.X(t2), x1: this.X(t3), floor: TOCA.floor, roof: TOCA.roof, opened: false });
  }

  /**
   * Tora que encontra a capivara em `tm` (s do padrão). Fica parada fora da
   * tela e começa a rolar `LOG.lead` s antes; rola por cima do trecho logo
   * depois do encontro (por isso o padrão deixa esse trecho livre).
   */
  log(tm: number, k: number = LOG.k): number {
    const meet = this.X(tm);
    const lead = LOG.lead * this.v;
    this.level.logs.push({ x0: meet + k * lead, trig: meet - lead, k, r: LOG.r, broken: false, rolling: false, passed: false });
    // Até onde a tora parada fica: o padrão precisa durar até aqui.
    return tm + k * LOG.lead;
  }

  /** Cipó pendurado em x(t), preso na altura `ay`, com comprimento `len`. */
  vine(t: number, ay: number, len: number): void {
    this.level.vines.push({ ax: this.X(t), ay, len });
  }

  /** Capins ao longo do balanço do cipó (círculo de raio `r` em volta da âncora). */
  swingArc(t: number, ay: number, r: number, n: number): void {
    const ax = this.X(t);
    for (let i = 0; i < n; i++) {
      const th = -0.15 + (0.95 * i) / Math.max(1, n - 1);
      this.level.fruits.push({ x: ax + r * Math.sin(th), y: ay - r * Math.cos(th), taken: false, risky: false });
    }
  }

  fruit(t: number, y: number, risky = false): void {
    this.level.fruits.push({ x: this.X(t), y: y + SIZES.fruitLift, taken: false, risky });
  }

  /** Fileira de `n` capins de t0 a t1 na altura dos pés `y`. */
  row(t0: number, t1: number, y: number, n: number, risky = false): void {
    for (let i = 0; i < n; i++) this.fruit(n === 1 ? (t0 + t1) / 2 : t0 + ((t1 - t0) * i) / (n - 1), y, risky);
  }

  /**
   * Frutas ao longo da trajetória de um pulo que sai do chão (altura `base`)
   * em `takeoff`: segurando o tempo `hold` (s). Como a trajetória vem da
   * própria física, todo capim do arco é alcançável.
   */
  arc(takeoff: number, hold: number, n: number, base = 0, risky = false): void {
    const air = airTime(hold);
    for (let i = 0; i < n; i++) {
      const tau = air * (0.18 + (0.64 * i) / Math.max(1, n - 1));
      this.fruit(takeoff + tau, base + jumpHeightAt(tau, hold), risky);
    }
  }

  /** Talvez coloque um capim arriscado (ex.: no meio de um rio, na altura de um pulo baixo). */
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
  /** Peso extra (ou 0 = nunca) em cada bioma; o que não está aqui vale 1. */
  biomes?: Partial<Record<BiomeId, number>>;
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
    biomes: { caatinga: 1.6, pantanal: 0.6 },
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
    biomes: { caatinga: 1.6, cerrado: 1.3 },
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
    biomes: { pantanal: 2, caatinga: 0.3 },
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
    biomes: { pantanal: 2, caatinga: 0.3 },
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
    biomes: { caatinga: 2 },
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
    biomes: { caatinga: 1.5 },
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
    // Galho com capins por cima de uma pedra: caminho alto (capins) ou pular a pedra.
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
    // Cipó por cima de uma pedra: pule e agarre para balançar pelos capins (ou só pule a pedra).
    id: 'cipo-capim',
    biomes: { caatinga: 0, cerrado: 0.5 },
    tier: 1,
    weight: 2,
    build(b) {
      b.vine(0.45, VINE_Y, 175);
      b.swingArc(0.45, VINE_Y, 160, 5);
      b.rock(0.62);
      return 0.75;
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
    biomes: { caatinga: 0.5 },
    tier: 1,
    weight: 2,
    build(b) {
      b.spring(0);
      b.pit(0.2, 0.75);
      // Arco dos capins: altura da mola (aprox.), metade do caminho.
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
    biomes: { pantanal: 1.5, caatinga: 0.4 },
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
    biomes: { pantanal: 2.2, caatinga: 0.2 },
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
    biomes: { pantanal: 1.8, caatinga: 0.3 },
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
    // Rio largo com cipó no meio: pular, agarrar e se lançar para o outro lado.
    id: 'cipo',
    biomes: { caatinga: 0, cerrado: 0.5 },
    tier: 2,
    weight: 3,
    build(b) {
      b.pit(0.05, 1.25);
      b.vine(0.5, VINE_Y, 180);
      b.swingArc(0.5, VINE_Y, 165, 4);
      return 1.3;
    },
  },
  {
    // Copa das árvores: pule no cipó e ele te lança lá em cima, onde há muito
    // capim e pequenos vãos entre as copas. Embaixo, o caminho segue com caixotes.
    id: 'copa',
    biomes: { caatinga: 0, cerrado: 0.4, pantanal: 0.6 },
    tier: 2,
    weight: 2,
    build(b) {
      b.vine(0.35, CANOPY.vineY, CANOPY.vineLen);
      const segs: Array<[number, number]> = [
        [0.6, 1.9],
        [2.15, 3.3],
        [3.55, 4.4],
      ];
      for (const [a, z] of segs) {
        b.platform(a, z, CANOPY.y, 'copa');
        b.row(a + 0.15, z - 0.1, CANOPY.y, Math.max(3, Math.round((z - a) * 6)));
      }
      // Arcos de capim sobre os vãos (recompensa por pular de copa em copa).
      b.arc(1.82, HOLD_TAP, 3, CANOPY.y);
      b.arc(3.22, HOLD_TAP, 3, CANOPY.y);
      // Embaixo: caminho seguro com caixotes e pouco capim.
      b.crate(1.3);
      b.crate(2.9);
      b.row(1.8, 2.3, 0, 3);
      return 4.45;
    },
  },
  {
    // Lama (Pantanal): pule a poça (segurando) ou atole e fique lenta.
    id: 'lama',
    tier: 1,
    weight: 3,
    biomes: { mata: 0, pantanal: 1, cerrado: 0.3, caatinga: 0 },
    build(b) {
      b.mud(0, 0.5);
      b.arc(-0.1, HOLD_FULL, 5);
      return 0.5;
    },
  },
  {
    // Lama e logo depois uma pedra: pule a lama sem atolar para pular a pedra.
    id: 'lama-pedra',
    tier: 2,
    weight: 2,
    biomes: { mata: 0, pantanal: 1, cerrado: 0, caatinga: 0 },
    build(b) {
      b.mud(0, 0.45);
      b.rock(0.95);
      b.arc(0.8, HOLD_TAP, 3);
      return 1.05;
    },
  },
  {
    // Cupinzeiro (Cerrado): pule por cima ou suba nele (capim em cima).
    id: 'cupinzeiro',
    tier: 1,
    weight: 3,
    biomes: { mata: 0, pantanal: 0, cerrado: 1, caatinga: 0 },
    build(b) {
      b.cupim(0);
      b.row(0.02, 0.1, 58, 2);
      return 0.15;
    },
  },
  {
    // Dois cupinzeiros: de um para o outro por cima ou dois pulos.
    id: 'cupinzeiros',
    tier: 2,
    weight: 2,
    biomes: { mata: 0, pantanal: 0, cerrado: 1, caatinga: 0 },
    build(b) {
      b.cupim(0);
      b.cupim(0.55);
      b.row(0.15, 0.45, 95, 3);
      return 0.7;
    },
  },
  {
    // Mandacaru (Caatinga): cacto alto, pulo um pouco segurado.
    id: 'mandacaru',
    tier: 1,
    weight: 3,
    biomes: { mata: 0, pantanal: 0, cerrado: 0, caatinga: 1 },
    build(b) {
      b.mandacaru(0);
      b.arc(-0.14, HOLD_FULL, 4);
      return 0.1;
    },
  },
  {
    // Dois mandacarus seguidos.
    id: 'mandacarus',
    tier: 2,
    weight: 2,
    biomes: { mata: 0, pantanal: 0, cerrado: 0, caatinga: 1 },
    build(b) {
      b.mandacaru(0);
      b.mandacaru(0.85);
      b.row(0.38, 0.55, 0, 2);
      return 0.95;
    },
  },
  {
    // Sucuri no galho: passe CORRENDO por baixo (pular aqui é bater nela).
    id: 'sucuri',
    tier: 2,
    weight: 3,
    biomes: { mata: 0.6, pantanal: 1.4, cerrado: 0, caatinga: 0 },
    build(b) {
      b.snake(0.3);
      b.row(0.1, 0.5, 0, 4);
      return 0.55;
    },
  },
  {
    // Sucuri e logo depois uma pedra: espere passar a cobra para pular.
    id: 'sucuri-pedra',
    tier: 3,
    weight: 2,
    biomes: { mata: 0.5, pantanal: 1.2, cerrado: 0, caatinga: 0 },
    build(b) {
      b.snake(0.2);
      b.rock(0.85);
      b.arc(0.68, HOLD_TAP, 3);
      return 0.95;
    },
  },
  {
    // Ninho de marimbondo cai da árvore na frente: pule por cima dele.
    id: 'ninho',
    tier: 1,
    weight: 3,
    biomes: { mata: 0.7, pantanal: 0, cerrado: 1.4, caatinga: 0.4 },
    build(b) {
      b.nest(0.2);
      b.arc(0.0, HOLD_TAP, 3);
      return 0.3;
    },
  },
  {
    // Dois ninhos caindo em sequência.
    id: 'ninhos',
    tier: 3,
    weight: 2,
    biomes: { mata: 0.5, pantanal: 0, cerrado: 1.2, caatinga: 0 },
    build(b) {
      b.nest(0.2);
      b.nest(0.95);
      b.arc(0.0, HOLD_TAP, 3);
      b.arc(0.75, HOLD_TAP, 3);
      return 1.05;
    },
  },
  {
    // Toca da capivara: um buraco escondido sob folhas. Quem passa correndo cai
    // na toca — um túnel seguro e cheio de capim (alguns pedem um pulinho, o
    // teto é baixo) — e o buraco de saída lança de volta para a superfície.
    // Quem pula o buraco segue por cima, com pedras e espinhos.
    id: 'toca',
    biomes: { cerrado: 1.6, pantanal: 0.4 },
    tier: 2,
    weight: 2,
    build(b) {
      b.burrow(0, 0.4, 3.3, 3.72);
      // Embaixo: fileiras no chão e uma no alto (pulinho).
      b.row(0.55, 1.25, TOCA.floor, 6);
      b.row(1.5, 1.95, TOCA.floor + 34, 4);
      b.row(2.2, 3.15, TOCA.floor, 7);
      // Por cima: pedra, espinhos e pedra grande, com pouco capim.
      b.rock(0.95);
      b.thorns(1.75, 0.28);
      b.rock(2.6, true);
      b.row(2.0, 2.3, 0, 2);
      // Folga para a capivara voltar do lançamento da saída (~1 s no ar).
      return 3.72 + 0.65;
    },
  },
  {
    // Tora rolando: um toque curto passa por cima (ou quique nela).
    id: 'tora',
    biomes: { caatinga: 0.4, mata: 1.3 },
    tier: 1,
    weight: 3,
    build(b) {
      const end = b.log(0.4);
      b.arc(0.22, HOLD_TAP, 3);
      return end;
    },
  },
  {
    // Duas toras seguidas: dois pulos no ritmo.
    id: 'toras',
    biomes: { caatinga: 0.3 },
    tier: 3,
    weight: 2,
    build(b) {
      b.log(0.4);
      const end = b.log(1.25);
      b.arc(0.22, HOLD_TAP, 3);
      b.arc(1.07, HOLD_TAP, 3);
      return end;
    },
  },
  {
    // Pedra e logo depois uma tora rolando.
    id: 'pedra-tora',
    tier: 2,
    weight: 2,
    build(b) {
      b.rock(0);
      const end = b.log(1.0);
      b.arc(0.82, HOLD_TAP, 3);
      return end;
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
    biomes: { caatinga: 2 },
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
    biomes: { caatinga: 0.5 },
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
    biomes: { pantanal: 1.8, caatinga: 0.2 },
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
export function pickPattern(rng: Rng, tier: number, previous: string | null, biome: BiomeId = 'mata'): Pattern {
  const bw = (p: Pattern) => p.biomes?.[biome] ?? 1;
  const pool = PATTERNS.filter((p) => p.tier <= tier && p.id !== previous && bw(p) > 0);
  // Padrões do nível recém-liberado aparecem um pouco mais (sensação de novidade).
  const w = (p: Pattern) => p.weight * bw(p) * (p.tier === tier && tier > 0 ? 1.6 : 1);
  let total = 0;
  for (const p of pool) total += w(p);
  let r = rng() * total;
  for (const p of pool) {
    r -= w(p);
    if (r <= 0) return p;
  }
  return pool[pool.length - 1];
}
