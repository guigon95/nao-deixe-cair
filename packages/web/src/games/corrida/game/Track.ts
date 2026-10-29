import { difficultyAt, riskyFruitChance, speedAt } from './Difficulty';
import { Level } from './Level';
import { Builder, PATTERNS, pickPattern, type Pattern } from './patterns';
import { randRange, type Rng } from '../../../shared/random';

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
export class Track {
  readonly level = new Level();
  /** Até onde já foi gerado (x). */
  genX = 0;
  /** Padrões gerados (para depuração e testes). */
  readonly history: Array<{ id: string; x: number; t: number }> = [];
  private prev: string | null = null;
  /** Força uma lista de padrões (testes); vazio = sorteio. */
  forced: string[] = [];

  constructor(private rng: Rng) {
    this.reset(rng);
  }

  reset(rng: Rng): void {
    this.rng = rng;
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
    const dur = pattern.build(b);
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
}

export function byId(id: string): Pattern {
  const p = PATTERNS.find((q) => q.id === id);
  if (!p) throw new Error(`padrão desconhecido: ${id}`);
  return p;
}
