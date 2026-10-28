import { SCORING, STORAGE } from './config';
import type { ManeuverEvent, ManeuverKind } from './types';
import type { Storage } from '../../../shared/storage/storage';

/**
 * Pontuação: distância + manobras × combo. Manobras encadeadas dentro da
 * janela sobem o multiplicador (×2, ×3...). Ficar tempo demais sem manobra
 * (ou bater) zera o multiplicador.
 */
export class Score {
  /** Maior x alcançado desde a decolagem. */
  distance = 0;
  maneuverPoints = 0;
  multiplier = 1;
  /** Segundos desde a última manobra. */
  sinceLast = Infinity;
  best = 0;
  bestAtStart = 0;
  maneuvers = 0;
  loops = 0;
  bestMultiplier = 1;
  private lastKind: ManeuverKind | null = null;
  private streak = 0;
  private startX = 0;
  private recordAnnounced = false;
  private frozen = false;
  private readonly event: ManeuverEvent = { kind: 'loop', points: 0, base: 0, multiplier: 1, count: 1, x: 0, y: 0 };

  constructor(private storage: Storage) {
    this.best = this.loadBest();
  }

  get score(): number {
    return Math.floor(this.distance * SCORING.pointsPerUnit) + this.maneuverPoints;
  }

  reset(startX: number): void {
    this.distance = 0;
    this.maneuverPoints = 0;
    this.multiplier = 1;
    this.sinceLast = Infinity;
    this.bestAtStart = this.best;
    this.maneuvers = 0;
    this.loops = 0;
    this.bestMultiplier = 1;
    this.lastKind = null;
    this.streak = 0;
    this.startX = startX;
    this.recordAnnounced = false;
    this.frozen = false;
  }

  /** Avança o relógio do combo. Retorna o multiplicador perdido (> 1) quando a janela expira. */
  tick(dt: number, x: number): number {
    if (this.frozen) return 0;
    this.distance = Math.max(this.distance, x - this.startX);
    this.sinceLast += dt;
    if (this.multiplier > 1 && this.sinceLast > SCORING.comboWindow) {
      const lost = this.multiplier;
      this.multiplier = 1;
      this.streak = 0;
      this.lastKind = null;
      return lost;
    }
    return 0;
  }

  /** Registra uma manobra. Retorna o evento (objeto reaproveitado). */
  add(kind: ManeuverKind, base: number, x: number, y: number): ManeuverEvent {
    if (this.sinceLast <= SCORING.comboWindow && this.maneuvers > 0) {
      this.multiplier = Math.min(SCORING.comboMax, this.multiplier + 1);
    } else this.multiplier = 1;
    this.streak = kind === this.lastKind ? this.streak + 1 : 1;
    this.lastKind = kind;
    this.sinceLast = 0;
    this.maneuvers++;
    if (kind === 'loop') this.loops++;
    this.bestMultiplier = Math.max(this.bestMultiplier, this.multiplier);
    const points = this.frozen ? 0 : base * this.multiplier;
    this.maneuverPoints += points;
    const e = this.event;
    e.kind = kind;
    e.base = base;
    e.points = points;
    e.multiplier = this.multiplier;
    e.count = this.streak;
    e.x = x;
    e.y = y;
    return e;
  }

  /** Combo zerado (batida). */
  breakCombo(): void {
    this.multiplier = 1;
    this.streak = 0;
    this.lastKind = null;
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
    this.breakCombo();
    const score = this.score;
    const isNewRecord = score > this.bestAtStart && this.bestAtStart > 0;
    if (score > this.best) {
      this.best = score;
      try {
        this.storage.setItem(STORAGE.best, String(score));
      } catch {
        /* recorde vale só nesta sessão */
      }
    }
    return { score, best: this.best, isNewRecord };
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

  get isFrozen() {
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
