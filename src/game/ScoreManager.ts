import { SCORING, STORAGE_KEYS } from './config';
import type { Storage } from './types';

/** Armazenamento em memória — usado quando o localStorage está indisponível. */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

/**
 * Envolve qualquer Storage para que falhas (modo privado, cota cheia,
 * cookies bloqueados) nunca impeçam o jogo de funcionar.
 */
export class SafeStorage implements Storage {
  private fallback = new MemoryStorage();
  constructor(private inner: Storage | null) {}
  getItem(key: string): string | null {
    try {
      const v = this.inner?.getItem(key);
      if (v !== null && v !== undefined) return v;
    } catch {
      /* ignora: usa fallback */
    }
    return this.fallback.getItem(key);
  }
  setItem(key: string, value: string): void {
    this.fallback.setItem(key, value);
    try {
      this.inner?.setItem(key, value);
    } catch {
      /* ignora: valor fica só na memória */
    }
  }
}

export function browserStorage(): Storage {
  let ls: Storage | null;
  try {
    ls = typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    ls = null;
  }
  return new SafeStorage(ls);
}

export class ScoreManager {
  /** Tempo de sobrevivência (s). */
  time = 0;
  barriers = 0;
  best = 0;
  /** Recorde no início da partida — para saber se houve novo recorde. */
  bestAtStart = 0;
  private recordAnnounced = false;
  private frozen = false;

  constructor(private storage: Storage) {
    this.best = this.loadBest();
  }

  get score(): number {
    return Math.floor(this.time * SCORING.pointsPerSecond) + this.barriers * SCORING.pointsPerBarrier;
  }

  reset(): void {
    this.time = 0;
    this.barriers = 0;
    this.bestAtStart = this.best;
    this.recordAnnounced = false;
    this.frozen = false;
  }

  /** Retorna true no instante em que a pontuação supera o recorde anterior (uma vez por partida). */
  addTime(dt: number): boolean {
    if (this.frozen) return false;
    this.time += dt;
    return this.checkRecord();
  }

  addBarrier(): boolean {
    if (this.frozen) return false;
    this.barriers++;
    return this.checkRecord();
  }

  private checkRecord(): boolean {
    if (!this.recordAnnounced && this.bestAtStart > 0 && this.score > this.bestAtStart) {
      this.recordAnnounced = true;
      return true;
    }
    return false;
  }

  /** Encerra a partida: congela a pontuação e persiste o recorde. */
  finish(): { score: number; best: number; isNewRecord: boolean } {
    this.frozen = true;
    const score = this.score;
    const isNewRecord = score > this.bestAtStart;
    if (score > this.best) {
      this.best = score;
      this.saveBest(score);
    }
    // Na primeira partida (sem recorde anterior) não há “novo recorde” para comemorar.
    return { score, best: this.best, isNewRecord: isNewRecord && this.bestAtStart > 0 };
  }

  get isFrozen() {
    return this.frozen;
  }

  private loadBest(): number {
    try {
      const raw = this.storage.getItem(STORAGE_KEYS.best);
      const n = raw === null ? 0 : Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private saveBest(v: number): void {
    try {
      this.storage.setItem(STORAGE_KEYS.best, String(v));
    } catch {
      /* armazenamento indisponível: recorde vale só nesta sessão */
    }
  }
}
