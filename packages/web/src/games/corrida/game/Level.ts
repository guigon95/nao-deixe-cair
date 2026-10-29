import type { Crate, Fruit, GroundSpan, Platform, Rock, Spring, Thorns } from './types';

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

  clear(): void {
    this.ground.length = 0;
    this.rocks.length = 0;
    this.platforms.length = 0;
    this.crates.length = 0;
    this.thorns.length = 0;
    this.springs.length = 0;
    this.fruits.length = 0;
  }

  /** Acrescenta chão; emenda com o trecho anterior se encostar. */
  addGround(x0: number, x1: number): void {
    if (x1 <= x0) return;
    const last = this.ground[this.ground.length - 1];
    if (last && x0 <= last.x1 + 0.5) last.x1 = Math.max(last.x1, x1);
    else this.ground.push({ x0, x1 });
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
  }

  /** Existe chão sob [a, b]? (Usado pelos testes e pelo desenho.) */
  groundAt(x: number): boolean {
    for (const g of this.ground) {
      if (g.x0 > x) return false;
      if (x <= g.x1) return true;
    }
    return false;
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
      this.fruits.length
    );
  }
}

function dropBefore<T>(list: T[], x: number, end: (t: T) => number): void {
  let n = 0;
  while (n < list.length && end(list[n]) < x) n++;
  if (n > 0) list.splice(0, n);
}
