import { MANEUVERS, SCORING } from './config';
import type { PlaneState } from './Plane';
import type { ManeuverKind } from './types';

/** Manobra reconhecida num passo (pontos base, antes do combo). */
export interface Detected {
  kind: ManeuverKind;
  base: number;
}

const TWO_PI = Math.PI * 2;

/**
 * Reconhece manobras automaticamente a partir da trajetória, sem botão.
 *
 * - Loop: o ângulo da trajetória (contínuo) sobe 360° acima do menor valor
 *   desde o último loop. Oscilações de sobe-desce não somam (é rotação
 *   líquida, não acumulada), e um giro "ajudado" pelo estol não conta.
 * - Meio loop: 180° líquidos e saída nivelada (invertida ou não) por um tempo.
 * - Voo invertido: tempo de cabeça para baixo, pago ao endireitar.
 * - Rasante: passar rente ao chão em alta velocidade e subir sem bater.
 * - Recuperação de estol: sair de um estol e voltar a voar.
 */
export class ManeuverDetector {
  private base = 0;
  private halfDone = false;
  private levelTime = 0;
  private stallInLoop = false;
  private invertedTime = 0;
  private inStall = false;
  private stallClear = 0;
  private rasanteArmed = false;
  private readonly out: Detected[] = [];

  reset(phi = 0): void {
    this.base = phi;
    this.halfDone = false;
    this.levelTime = 0;
    this.stallInLoop = false;
    this.invertedTime = 0;
    this.inStall = false;
    this.stallClear = 0;
    this.rasanteArmed = false;
    this.out.length = 0;
  }

  /** Avança um passo. Retorna as manobras completadas neste passo (array reaproveitado). */
  update(p: PlaneState, altitude: number, dt: number): readonly Detected[] {
    const out = this.out;
    out.length = 0;
    const sin = Math.sin(p.phi);
    const cos = Math.cos(p.phi);

    // ---- Loop e meio loop (rotação líquida para cima) ----
    if (p.phi < this.base) {
      this.base = p.phi;
      this.halfDone = false;
      this.stallInLoop = false;
    }
    const net = p.phi - this.base;
    if (p.stall > 0.6 && net > 0.3) this.stallInLoop = true;
    if (net >= MANEUVERS.loopAngle) {
      if (!this.stallInLoop) out.push({ kind: 'loop', base: SCORING.loop });
      this.base += TWO_PI;
      this.halfDone = false;
      this.stallInLoop = false;
    } else if (!this.halfDone && net >= MANEUVERS.halfLoopAngle - 0.25 && net < MANEUVERS.loopAngle - 0.6) {
      if (Math.abs(sin) < MANEUVERS.halfLoopLevelSin && p.stall < 0.3) {
        this.levelTime += dt;
        if (this.levelTime >= MANEUVERS.halfLoopHold) {
          this.halfDone = true;
          if (!this.stallInLoop) out.push({ kind: 'halfLoop', base: SCORING.halfLoop });
        }
      } else this.levelTime = 0;
    } else this.levelTime = 0;

    // ---- Voo invertido ----
    if (cos < -0.5 && p.stall < 0.5) this.invertedTime += dt;
    else if (cos > -0.2) {
      if (this.invertedTime >= SCORING.invertedMin) {
        out.push({ kind: 'inverted', base: Math.round(SCORING.invertedPerSecond * this.invertedTime) });
      }
      this.invertedTime = 0;
    }

    // ---- Estol e recuperação ----
    if (p.stall > 0.6) {
      this.inStall = true;
      this.stallClear = 0;
    } else if (this.inStall) {
      if (p.stall < 0.05 && sin > -0.6) {
        this.stallClear += dt;
        if (this.stallClear >= 0.4) {
          this.inStall = false;
          out.push({ kind: 'stallRecovery', base: SCORING.stallRecovery });
        }
      } else this.stallClear = 0;
    }

    // ---- Rasante ----
    if (altitude < MANEUVERS.rasanteHeight && p.speed >= MANEUVERS.rasanteSpeed) this.rasanteArmed = true;
    if (this.rasanteArmed && altitude > MANEUVERS.rasanteExit) {
      this.rasanteArmed = false;
      out.push({ kind: 'rasante', base: SCORING.rasante });
    }
    return out;
  }

  /** Para a interface: segundos de cabeça para baixo agora. */
  get invertedSeconds() {
    return this.invertedTime;
  }

  get stalled() {
    return this.inStall;
  }
}
