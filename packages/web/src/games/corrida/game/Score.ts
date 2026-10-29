import { SCORING, STORAGE } from './config';
import type { Storage } from '../../../shared/storage/storage';

/**
 * Pontuação: metros corridos + bônus (tufos de capim, quebras, pisões).
 * O recorde fica em `ndc:corrida:best` (mesmo padrão dos outros jogos).
 */
export class Score {
  distance = 0;
  fruits = 0;
  bonus = 0;
  best = 0;
  bestAtStart = 0;
  private startX = 0;
  private recordAnnounced = false;
  private frozen = false;

  constructor(private storage: Storage) {
    this.best = this.loadBest();
  }

  get meters(): number {
    return Math.floor(this.distance / SCORING.unitsPerMeter);
  }

  get score(): number {
    return this.meters + this.fruits * SCORING.fruit + this.bonus;
  }

  reset(startX: number): void {
    this.distance = 0;
    this.fruits = 0;
    this.bonus = 0;
    this.startX = startX;
    this.bestAtStart = this.best;
    this.recordAnnounced = false;
    this.frozen = false;
  }

  tick(x: number): void {
    if (!this.frozen) this.distance = Math.max(this.distance, x - this.startX);
  }

  addFruit(): void {
    if (!this.frozen) this.fruits++;
  }

  addBonus(n: number): void {
    if (!this.frozen) this.bonus += n;
  }

  /** Verdadeiro uma vez por partida, quando passa do recorde anterior. */
  checkRecord(): boolean {
    if (!this.recordAnnounced && this.bestAtStart > 0 && this.score > this.bestAtStart) {
      this.recordAnnounced = true;
      return true;
    }
    return false;
  }

  finish(): { score: number; best: number; isNewRecord: boolean } {
    this.frozen = true;
    const score = this.score;
    const isNewRecord = score > this.bestAtStart && this.bestAtStart > 0;
    if (score > this.best) {
      this.best = score;
      try {
        this.storage.setItem(STORAGE.best, String(score));
      } catch {
        /* vale só nesta sessão */
      }
    }
    return { score, best: this.best, isNewRecord };
  }

  /** Continuou depois de bater: volta a contar pontos. */
  unfreeze(): void {
    this.frozen = false;
  }

  /** Recorde vindo da conta (servidor): só sobe e fica salvo aqui também. */
  raiseBest(n: number): boolean {
    if (!(Number.isFinite(n) && n > this.best)) return false;
    this.best = Math.floor(n);
    if (this.frozen || this.distance === 0) this.bestAtStart = this.best;
    try {
      this.storage.setItem(STORAGE.best, String(this.best));
    } catch {
      /* vale só nesta sessão */
    }
    return true;
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  private loadBest(): number {
    try {
      const n = Number.parseInt(this.storage.getItem(STORAGE.best) ?? '', 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }
}
