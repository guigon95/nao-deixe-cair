import { difficultyAt, riskyFruitChance, speedAt } from './Difficulty';
import { Level } from './Level';
import { Builder, PATTERNS, pickPattern, type Pattern } from './patterns';
import { createRng, randRange, type Rng } from '../../../shared/random';
import { CRATE_LOOT, ITEMS, type MountAnimal } from './config';
import type { ItemKind } from './types';

/** Quanto gerar à frente da capivara (u): mais que uma tela larga. */
export const LOOKAHEAD = 1500;
/** Quanto guardar atrás antes de descartar (u). */
const KEEP_BEHIND = 500;
/** Começo livre (s): dá tempo de entender a corrida antes do 1º obstáculo. */
export const INTRO_TIME = 2.2;
/**
 * Depois do último obstáculo de um padrão, o tempo de um pulo segurado
 * (≈0,66 s) garante que dá para pousar antes do próximo — mais a folga do
 * nível de dificuldade.
 */
const LANDING_TIME = 0.6;

/**
 * Gera o percurso à frente: padrões validados encadeados com folgas que
 * dependem da dificuldade. Determinístico para uma semente.
 */
/** Montarias que podem sair dos caixotes. */
export const MOUNT_ANIMALS: readonly MountAnimal[] = ['ema', 'anta'];

export class Track {
  readonly level = new Level();
  /** Até onde já foi gerado (x). */
  genX = 0;
  /** Padrões gerados (para depuração e testes). */
  readonly history: Array<{ id: string; x: number; t: number }> = [];
  private prev: string | null = null;
  /** Sorteios dos itens especiais (separado, para não mexer na sequência de padrões). */
  private itemRng: Rng = createRng(1);
  private crateRng: Rng = createRng(2);
  private lastItem = -Infinity;
  private lastMount = -Infinity;
  /** Força uma lista de padrões (testes); vazio = sorteio. */
  forced: string[] = [];

  constructor(private rng: Rng) {
    this.reset(rng);
  }

  reset(rng: Rng): void {
    this.rng = rng;
    const itemSeed = Math.floor(rng() * 0xffffffff);
    this.itemRng = createRng(itemSeed);
    // Sorteio próprio dos caixotes: não mexe no percurso nem nos itens.
    this.crateRng = createRng((itemSeed ^ 0x9e3779b9) >>> 0);
    this.lastItem = -Infinity;
    this.lastMount = -Infinity;
    this.level.clear();
    this.history.length = 0;
    this.prev = null;
    this.genX = 0;
    // Começo: chão livre desde antes da tela, com uma fileira de capins.
    const v = speedAt(0);
    const introEnd = INTRO_TIME * v;
    this.level.addGround(-800, introEnd);
    const b = new Builder(this.level, 0, v, rng);
    b.row(0.9, 1.7, 0, 5);
    this.genX = introEnd;
  }

  /**
   * Gera até `playerX + LOOKAHEAD`. A velocidade usada em cada padrão é a
   * que a capivara terá ao chegar nele (estimativa pelo tempo de partida).
   */
  update(playerX: number, elapsed: number, currentSpeed: number): void {
    while (this.genX < playerX + LOOKAHEAD) {
      const eta = elapsed + Math.max(0, this.genX - playerX) / Math.max(1, currentSpeed);
      this.addPattern(eta);
    }
    this.level.prune(playerX - KEEP_BEHIND);
  }

  private addPattern(t: number): void {
    const d = difficultyAt(t);
    const pattern = this.forced.length > 0 ? byId(this.forced.shift()!) : pickPattern(this.rng, d.tier, this.prev);
    this.prev = pattern.id;
    const v = d.speed;
    const b = new Builder(this.level, this.genX, v, this.rng, riskyFruitChance(t));
    const firstFruit = this.level.fruits.length;
    const firstCrate = this.level.crates.length;
    const dur = pattern.build(b);
    this.maybeItem(t, firstFruit);
    this.fillCrates(t, firstCrate);
    this.history.push({ id: pattern.id, x: this.genX, t });
    if (this.history.length > 64) this.history.shift();
    // Chão do padrão, com os buracos.
    let cursor = this.genX;
    b.pits.sort((p, q) => p[0] - q[0]);
    for (const [a, z] of b.pits) {
      this.level.addGround(cursor, a);
      cursor = Math.max(cursor, z);
    }
    const end = this.genX + (dur + LANDING_TIME + randRange(this.rng, d.rest.min, d.rest.max)) * v;
    this.level.addGround(cursor, end);
    // Mantém as listas em ordem (capins de arcos podem sair um pouco fora de ordem).
    this.level.fruits.sort((p, q) => p.x - q.x);
    this.genX = end;
  }

  /** Sorteia o que vai dentro dos caixotes novos: capim, um item especial ou nada. */
  private fillCrates(t: number, first: number): void {
    for (let i = first; i < this.level.crates.length; i++) {
      const r = this.crateRng();
      const n = this.crateRng();
      if (r < CRATE_LOOT.capim) {
        this.level.crates[i].loot = { kind: 'capim', n: CRATE_LOOT.capimMin + Math.floor(n * (CRATE_LOOT.capimMax - CRATE_LOOT.capimMin + 1)) };
      } else if (r < CRATE_LOOT.capim + CRATE_LOOT.item) {
        if (t >= ITEMS.firstAfter) this.level.crates[i].loot = { kind: 'item', item: pickKind(n) };
      } else if (r < CRATE_LOOT.capim + CRATE_LOOT.item + CRATE_LOOT.mount) {
        if (t >= CRATE_LOOT.mountAfter && t - this.lastMount >= CRATE_LOOT.mountGap) {
          this.level.crates[i].loot = { kind: 'mount', animal: MOUNT_ANIMALS[Math.floor(this.crateRng() * MOUNT_ANIMALS.length)] };
          this.lastMount = t;
        }
      }
    }
  }

  /** De vez em quando, troca um capim deste padrão (fora dos arriscados) por um item especial. */
  private maybeItem(t: number, firstFruit: number): void {
    if (t < ITEMS.firstAfter || t - this.lastItem < ITEMS.minGap) return;
    if (this.itemRng() >= ITEMS.chance) return;
    const fresh = this.level.fruits.slice(firstFruit).filter((f) => !f.risky);
    if (!fresh.length) return;
    const f = fresh[Math.floor(this.itemRng() * fresh.length)];
    this.level.fruits.splice(this.level.fruits.indexOf(f), 1);
    this.level.powerups.push({ x: f.x, y: f.y, kind: pickKind(this.itemRng()), taken: false });
    this.level.powerups.sort((p, q) => p.x - q.x);
    this.lastItem = t;
  }
}

/** Tipo de item pelo peso (`ITEMS.weights`). */
export function pickKind(r: number): ItemKind {
  const entries = Object.entries(ITEMS.weights) as Array<[ItemKind, number]>;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export function byId(id: string): Pattern {
  const p = PATTERNS.find((q) => q.id === id);
  if (!p) throw new Error(`padrão desconhecido: ${id}`);
  return p;
}
