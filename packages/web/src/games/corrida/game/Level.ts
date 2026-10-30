import type { Burrow, Crate, Log, Pup, Fruit, GroundSpan, Platform, PowerUp, Rock, Spring, Thorns, Vine } from './types';

/**
 * Conteúdo do percurso já gerado: listas em ordem crescente de x. O gerador
 * só acrescenta à direita; `prune` descarta o que ficou para trás da tela,
 * então as listas nunca crescem sem limite.
 */
export class Level {
  ground: GroundSpan[] = [];
  rocks: Rock[] = [];
  platforms: Platform[] = [];
  crates: Crate[] = [];
  thorns: Thorns[] = [];
  springs: Spring[] = [];
  fruits: Fruit[] = [];
  vines: Vine[] = [];
  powerups: PowerUp[] = [];
  burrows: Burrow[] = [];
  logs: Log[] = [];
  pups: Pup[] = [];

  clear(): void {
    this.ground.length = 0;
    this.rocks.length = 0;
    this.platforms.length = 0;
    this.crates.length = 0;
    this.thorns.length = 0;
    this.springs.length = 0;
    this.fruits.length = 0;
    this.vines.length = 0;
    this.powerups.length = 0;
    this.burrows.length = 0;
    this.logs.length = 0;
    this.pups.length = 0;
  }

  /** Acrescenta chão; emenda com o trecho anterior se encostar. */
  addGround(x0: number, x1: number): void {
    if (x1 <= x0) return;
    const last = this.ground[this.ground.length - 1];
    if (last && x0 <= last.x1 + 0.5) last.x1 = Math.max(last.x1, x1);
    else this.ground.push({ x0, x1 });
  }

  /**
   * Deixa [a, b] seguro (continuar depois de bater): chão contínuo e sem
   * pedras, espinhos, caixotes ou molas que comecem antes de `b`.
   */
  clearZone(a: number, b: number): void {
    const keep = <T extends { x0: number; x1: number }>(list: T[]) => {
      for (let i = list.length - 1; i >= 0; i--) if (list[i].x1 >= a && list[i].x0 <= b) list.splice(i, 1);
    };
    keep(this.rocks);
    keep(this.thorns);
    keep(this.crates);
    keep(this.springs);
    // Toras que encontrariam a capivara no trecho limpo somem.
    for (let i = this.logs.length - 1; i >= 0; i--) if (logMeet(this.logs[i]) <= b + 300) this.logs.splice(i, 1);
    // Toca no trecho: some (os buracos dela viram chão até o fim dela).
    for (let i = this.burrows.length - 1; i >= 0; i--) {
      const u = this.burrows[i];
      if (u.x1 >= a && u.x0 <= b) {
        a = Math.min(a, u.x0);
        b = Math.max(b, u.x1);
        this.burrows.splice(i, 1);
      }
    }
    // Chão: junta os trechos que tocam [a, b] num só.
    let lo = a;
    let hi = b;
    const rest: GroundSpan[] = [];
    // Se `b` cai no meio de um rio, emenda até a outra margem (nunca sobra meio rio).
    let next: GroundSpan | null = null;
    let onGround = false;
    for (const g of this.ground) {
      if (g.x0 <= b && g.x1 >= b) onGround = true;
      if (g.x0 > b && (!next || g.x0 < next.x0)) next = g;
    }
    for (const g of this.ground) {
      if ((g.x1 < a || g.x0 > b) && !(g === next && !onGround)) rest.push(g);
      else {
        lo = Math.min(lo, g.x0);
        hi = Math.max(hi, g.x1);
      }
    }
    rest.push({ x0: lo, x1: hi });
    rest.sort((p, q) => p.x0 - q.x0);
    this.ground.length = 0;
    this.ground.push(...rest);
  }

  /** Remove tudo que terminou antes de `x`. */
  prune(x: number): void {
    dropBefore(this.ground, x, (g) => g.x1);
    dropBefore(this.rocks, x, (r) => r.x1);
    dropBefore(this.platforms, x, (p) => p.x1);
    dropBefore(this.crates, x, (c) => c.x1);
    dropBefore(this.thorns, x, (t) => t.x1);
    dropBefore(this.springs, x, (s) => s.x1);
    dropBefore(this.fruits, x, (f) => f.x + 20);
    dropBefore(this.vines, x, (v) => v.ax + v.len);
    dropBefore(this.powerups, x, (u) => u.x + 30);
    dropBefore(this.burrows, x, (u) => u.x1);
    dropBefore(this.pups, x, (u) => u.x + 30);
    for (let i = this.logs.length - 1; i >= 0; i--) if (logMeet(this.logs[i]) + 300 < x) this.logs.splice(i, 1);
  }

  /** Existe chão sob [a, b]? (Usado pelos testes e pelo desenho.) */
  groundAt(x: number): boolean {
    for (const g of this.ground) {
      if (g.x0 > x) return false;
      if (x <= g.x1) return true;
    }
    return false;
  }

  /** Toca sob x (incluindo os buracos), ou null. */
  burrowAt(x: number): Burrow | null {
    for (const u of this.burrows) {
      if (u.x0 > x) return null;
      if (x <= u.x1) return u;
    }
    return null;
  }

  /** Quantidade total de objetos guardados (teste de vazamento). */
  get size(): number {
    return (
      this.ground.length +
      this.rocks.length +
      this.platforms.length +
      this.crates.length +
      this.thorns.length +
      this.springs.length +
      this.fruits.length +
      this.vines.length +
      this.powerups.length +
      this.burrows.length +
      this.logs.length +
      this.pups.length
    );
  }
}

function dropBefore<T>(list: T[], x: number, end: (t: T) => number): void {
  let n = 0;
  while (n < list.length && end(list[n]) < x) n++;
  if (n > 0) list.splice(0, n);
}

/** Centro da tora quando a capivara está em `rx`. */
export function logX(l: Log, rx: number): number {
  return l.x0 - l.k * Math.max(0, rx - l.trig);
}

/** x da capivara em que a tora a encontra (centro com centro). */
export function logMeet(l: Log): number {
  return (l.x0 + l.k * l.trig) / (1 + l.k);
}
