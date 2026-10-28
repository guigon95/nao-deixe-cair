import type { FlightCommand, PlaneState } from './Plane';

/**
 * Esquemas de controle de um toque. Recebem só "apertou / soltou" (e, no
 * esquema B, deslizes) com o tempo da simulação, e produzem o comando de voo
 * de cada passo. Padrão: esquema C. `?controle=a` e `?controle=b` ligam os
 * outros (para comparar).
 */
export type ControlSchemeId = 'a' | 'b' | 'c';

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
 * Esquema A — "acelerar é puxar o nariz" (o primeiro escolhido; hoje em `?controle=a`).
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

export const SCHEME_C = {
  /** Ângulo de subida que o "segurar" mantém (rad): sobe firme, nunca vira loop. */
  climbAngle: 0.62,
  /** Abaixo desta velocidade o ângulo de subida diminui até o nível (u/s). */
  slowSpeed: 175,
  speedBand: 90,
  /**
   * Ângulo de mergulho ao soltar (rad): como na bolinha, soltar desce na
   * hora e firme — não é um planeio. Segurar de novo inverte rápido.
   */
  diveAngle: 0.75,
  /** Ganho da puxada por radiano de erro e amortecimento pela rotação atual. */
  gain: 4,
  damping: 0.3,
  /** No mergulho o nariz desce com ganho próprio (resposta rápida ao soltar). */
  diveGain: 8,
  /**
   * Loop = toque + toque-e-segure: o primeiro toque é curto (≤ tapMax), o
   * segundo vem logo depois (≤ doubleTapGap) e fica pressionado por
   * holdConfirm. Quem bate na tela em ritmo raramente segura o segundo
   * toque, então quase não dispara loops sem querer.
   */
  tapMax: 0.2,
  doubleTapGap: 0.3,
  holdConfirm: 0.25,
  /**
   * Loop assistido: termina um pouco DEPOIS de 360° (rad) ou se estolar.
   * Passar da volta garante que o loop conte antes de o mergulho assumir.
   */
  loopOvershoot: 0.15,
} as const;

/** Ângulo da trajetória entre −π e π. */
function wrapAngle(phi: number): number {
  return Math.atan2(Math.sin(phi), Math.cos(phi));
}

/**
 * Esquema C — "segurar sobe, toque + toque-e-segure dá o loop" (padrão).
 * - Segurar = motor no máximo e o nariz sobe até um ângulo de subida firme
 *   e fica lá: quanto mais tempo segurar, mais alto o avião vai. Nunca vira
 *   loop sem querer.
 * - Soltar = marcha lenta e o nariz desce rápido até um mergulho firme
 *   (~43°), como a bolinha caindo; segurar de novo inverte na hora.
 * - Toque + toque-e-segure = loop: puxada total até passar da volta. Até
 *   o loop começar o avião já está subindo (o segundo toque é um "segurar"),
 *   e quem continua segurando sai do loop subindo.
 */
export class SchemeC implements ControlScheme {
  readonly id = 'c' as const;
  roll = 0;
  gestures = 0;
  private holding = false;
  private pressAt = -10;
  private lastTapEnd = -10;
  private loopStart: number | null = null;
  private loopArmed = false;
  /** Segundo toque em andamento: vira loop se ficar pressionado por holdConfirm. */
  private pendingAt: number | null = null;

  press(t: number): void {
    this.holding = true;
    if (t - this.lastTapEnd <= SCHEME_C.doubleTapGap && this.loopStart === null) {
      this.pendingAt = t;
      this.lastTapEnd = -10;
    }
    this.pressAt = t;
  }

  release(t: number): void {
    this.holding = false;
    this.pendingAt = null; // soltou cedo: era só um toque
    if (t - this.pressAt <= SCHEME_C.tapMax) this.lastTapEnd = t;
    else this.lastTapEnd = -10;
  }

  swipe(): void {}

  /** Loop assistido em andamento (para a interface). */
  get looping(): boolean {
    return this.loopStart !== null || this.loopArmed;
  }

  command(t: number, plane: PlaneState): FlightCommand {
    if (this.pendingAt !== null && this.holding && t - this.pendingAt >= SCHEME_C.holdConfirm) {
      this.pendingAt = null;
      this.loopArmed = true;
      this.gestures++;
    }
    if (this.loopArmed) {
      this.loopArmed = false;
      this.loopStart = plane.phi;
    }
    if (this.loopStart !== null) {
      const done = plane.phi - this.loopStart >= Math.PI * 2 + SCHEME_C.loopOvershoot;
      if (done || plane.stall > 0.7) this.loopStart = null;
      else return { throttle: 1, pull: 1 };
    }
    // Voando para trás (depois de um estol), não comanda: deixa o avião se recuperar para a frente.
    if (Math.cos(plane.phi) < 0) return { throttle: this.holding ? 1 : 0, pull: 0 };
    if (!this.holding) {
      // Soltou: empurra o nariz até o ângulo de mergulho e segura lá (nunca mais íngreme).
      const err = -SCHEME_C.diveAngle - wrapAngle(plane.phi);
      const pull = SCHEME_C.diveGain * err - SCHEME_C.damping * plane.turnRate;
      return { throttle: 0, pull: Math.min(1, Math.max(-1, pull)) };
    }
    // Mantém o ângulo de subida (menor quando está lento, para nunca estolar segurando).
    const slow = Math.min(1, Math.max(0, (plane.speed - SCHEME_C.slowSpeed) / SCHEME_C.speedBand));
    const target = SCHEME_C.climbAngle * slow;
    const err = target - wrapAngle(plane.phi);
    const pull = SCHEME_C.gain * err - SCHEME_C.damping * plane.turnRate;
    return { throttle: 1, pull: Math.min(1, Math.max(-1, pull)) };
  }

  reset(): void {
    this.holding = false;
    this.roll = 0;
    this.pressAt = -10;
    this.lastTapEnd = -10;
    this.loopStart = null;
    this.loopArmed = false;
    this.pendingAt = null;
  }
}

export function createScheme(id: ControlSchemeId): ControlScheme {
  if (id === 'a') return new SchemeA();
  if (id === 'b') return new SchemeB();
  return new SchemeC();
}

export function schemeFromUrl(search: string): ControlSchemeId {
  const v = new URLSearchParams(search).get('controle');
  return v === 'a' || v === 'b' ? v : 'c';
}
