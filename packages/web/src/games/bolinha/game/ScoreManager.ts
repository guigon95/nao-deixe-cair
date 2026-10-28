import { SCORING, STORAGE_KEYS } from './config';
import type { Storage } from '../../../shared/storage/storage';

export { browserStorage, MemoryStorage, SafeStorage } from '../../../shared/storage/storage';

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

  /**
   * Recorde vindo de fora (melhor da conta no servidor): só sobe, nunca desce,
   * e fica salvo neste aparelho também.
   */
  raiseBest(n: number): boolean {
    if (!(Number.isFinite(n) && n > this.best)) return false;
    this.best = Math.floor(n);
    if (this.bestAtStart < this.best && (this.frozen || this.time === 0)) this.bestAtStart = this.best;
    this.saveBest(this.best);
    return true;
  }

  /** Continuar depois de bater: a pontuação volta a contar de onde parou. */
  unfreeze(): void {
    this.frozen = false;
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
