import type { FlightCommand, PlaneState } from './Plane';

/**
 * Esquemas de controle de um toque. Recebem só "apertou / soltou" (e, no
 * esquema B, deslizes) com o tempo da simulação, e produzem o comando de voo
 * de cada passo. Selecionáveis por `?controle=a|b`.
 */
export type ControlSchemeId = 'a' | 'b';

export interface ControlScheme {
  readonly id: ControlSchemeId;
  /** Dedo encostou (t = tempo simulado em s). */
  press(t: number): void;
  release(t: number): void;
  /** Deslize vertical (u/s na tela, negativo = para cima). Só o esquema B usa. */
  swipe(t: number, dyPerSecond: number): void;
  /** Comando para o próximo passo. */
  command(t: number, plane: PlaneState): FlightCommand;
  /** Tonneau em andamento (0..1) — só visual no esquema B. */
  roll: number;
  /** Quantas manobras de gesto foram disparadas (avaliação de acidentais). */
  gestures: number;
  reset(): void;
}

/**
 * Esquema A — "acelerar é puxar o nariz".
 * Segurar = potência máxima + puxada total; soltar = marcha lenta, sem puxar.
 * A resposta é imediata: não há gesto para reconhecer.
 */
export class SchemeA implements ControlScheme {
  readonly id = 'a' as const;
  roll = 0;
  gestures = 0;
  private holding = false;

  press(): void {
    this.holding = true;
  }
  release(): void {
    this.holding = false;
  }
  swipe(): void {}
  command(): FlightCommand {
    return this.holding ? { throttle: 1, pull: 1 } : { throttle: 0, pull: 0 };
  }
  reset(): void {
    this.holding = false;
    this.roll = 0;
  }
}

export const SCHEME_B = {
  /** Segurar sobe só levemente. */
  holdPull: 0.32,
  /** Toque duplo: dois toques curtos com intervalo máximo (s). */
  tapMax: 0.2,
  doubleTapGap: 0.28,
  /** Duração do tonneau (s). */
  rollTime: 0.5,
  /** Deslize para cima: velocidade mínima (u/s de tela). */
  swipeSpeed: 900,
} as const;

/**
 * Esquema B — "toque = impulso, gestos = manobras".
 * Segurar acelera e sobe de leve; toque duplo = tonneau (só giro visual +
 * pontos); deslizar para cima = loop assistido (puxada total até 360°).
 */
export class SchemeB implements ControlScheme {
  readonly id = 'b' as const;
  roll = 0;
  gestures = 0;
  private holding = false;
  private pressAt = -1;
  private lastTapEnd = -10;
  private rollStart = -10;
  private loopStartPhi: number | null = null;
  private swipeArmed = true;
  /** Tonneaus completados (para pontuação). */
  rolls = 0;

  press(t: number): void {
    this.holding = true;
    this.pressAt = t;
    this.swipeArmed = true;
  }

  release(t: number): void {
    this.holding = false;
    const dur = t - this.pressAt;
    if (dur <= SCHEME_B.tapMax) {
      // Segundo toque curto logo depois do primeiro → tonneau.
      if (this.pressAt - this.lastTapEnd <= SCHEME_B.doubleTapGap && t - this.rollStart > SCHEME_B.rollTime) {
        this.rollStart = t;
        this.gestures++;
        this.lastTapEnd = -10;
        return;
      }
      this.lastTapEnd = t;
    }
  }

  swipe(_t: number, dyPerSecond: number): void {
    if (!this.holding || !this.swipeArmed || this.loopStartPhi !== null) return;
    if (-dyPerSecond >= SCHEME_B.swipeSpeed) {
      this.swipeArmed = false;
      this.loopStartPhi = Number.NaN; // marca: começa no próximo comando
      this.gestures++;
    }
  }

  command(t: number, plane: PlaneState): FlightCommand {
    const rollT = (t - this.rollStart) / SCHEME_B.rollTime;
    this.roll = rollT >= 0 && rollT < 1 ? rollT : 0;
    if (rollT >= 1 && this.rollStart > 0) {
      this.rolls++;
      this.rollStart = -10;
    }
    if (this.loopStartPhi !== null) {
      if (Number.isNaN(this.loopStartPhi)) this.loopStartPhi = plane.phi;
      if (plane.phi - this.loopStartPhi >= Math.PI * 2 - 0.15 || plane.stall > 0.7) this.loopStartPhi = null;
      else return { throttle: 1, pull: 1 };
    }
    return this.holding ? { throttle: 1, pull: SCHEME_B.holdPull } : { throttle: 0, pull: 0 };
  }

  reset(): void {
    this.holding = false;
    this.roll = 0;
    this.rollStart = -10;
    this.lastTapEnd = -10;
    this.loopStartPhi = null;
    this.rolls = 0;
  }
}

export function createScheme(id: ControlSchemeId): ControlScheme {
  return id === 'b' ? new SchemeB() : new SchemeA();
}

export function schemeFromUrl(search: string): ControlSchemeId {
  const v = new URLSearchParams(search).get('controle');
  return v === 'b' ? 'b' : 'a';
}
