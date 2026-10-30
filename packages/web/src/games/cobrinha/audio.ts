import { SynthAudio } from '../../shared/audio/SynthAudio';
import type { ItemKind } from './game/config';

/**
 * Sons do Fominha, todos sintetizados (sem arquivos de terceiros):
 * "nhac" ao comer (mais grave e gordo nos itens caros), caixa registradora
 * no dinheiro, fanfarra curta nos marcos de tamanho e um "fom-fom" triste ao bater.
 */
export class SnakeSfx extends SynthAudio {
  private lastTurn = -1;

  /** Mordida: estalo de ruído + "nhac" descendente. */
  eat(kind: ItemKind, multiplier: number) {
    const pitch = multiplier > 1 ? 1.25 : 1;
    this.noise(0.05, 0.35, 3000, 800, 'bandpass');
    switch (kind) {
      case 'chocolate':
        this.tone(520 * pitch, 300 * pitch, 0.1, 'square', 0.22);
        this.tone(780 * pitch, 900 * pitch, 0.08, 'triangle', 0.25, 0.06);
        break;
      case 'dinheiro':
      case 'rachadinha':
        // "plim" de caixa registradora
        this.tone(1318 * pitch, 1318 * pitch, 0.08, 'triangle', 0.35, 0.03);
        this.tone(1760 * pitch, 1760 * pitch, 0.22, 'triangle', 0.35, 0.09);
        if (kind === 'rachadinha') this.tone(880, 440, 0.18, 'sawtooth', 0.12, 0.14);
        break;
      case 'ouro':
        this.tone(988 * pitch, 988 * pitch, 0.07, 'sine', 0.4);
        this.tone(1480 * pitch, 1480 * pitch, 0.09, 'sine', 0.4, 0.06);
        this.tone(1976 * pitch, 2400 * pitch, 0.2, 'sine', 0.3, 0.12);
        break;
      case 'mansao':
        this.tone(392, 392, 0.1, 'triangle', 0.45);
        this.tone(523, 523, 0.1, 'triangle', 0.45, 0.09);
        this.tone(659, 659, 0.1, 'triangle', 0.45, 0.18);
        this.tone(784, 1046, 0.3, 'triangle', 0.5, 0.27);
        break;
      case 'jatinho':
        this.noise(0.6, 0.3, 400, 4000, 'bandpass', 0.02);
        this.tone(300, 1200, 0.5, 'sawtooth', 0.1, 0.02);
        break;
      case 'mala':
        this.tone(660, 660, 0.06, 'square', 0.25);
        this.tone(880, 880, 0.06, 'square', 0.25, 0.07);
        this.tone(1320, 1320, 0.25, 'square', 0.25, 0.14);
        break;
    }
  }

  /** Curva: tique bem baixinho (com limite de frequência). */
  turn() {
    const now = performance.now();
    if (now - this.lastTurn < 60) return;
    this.lastTurn = now;
    this.tone(240, 200, 0.03, 'triangle', 0.12);
  }

  spawnRare() {
    this.tone(1200, 1600, 0.08, 'sine', 0.18);
    this.tone(1600, 2000, 0.08, 'sine', 0.15, 0.08);
  }

  expire() {
    this.tone(700, 350, 0.18, 'triangle', 0.18);
  }

  milestone() {
    this.tone(523, 523, 0.1, 'square', 0.3);
    this.tone(659, 659, 0.1, 'square', 0.3, 0.1);
    this.tone(784, 784, 0.1, 'square', 0.3, 0.2);
    this.tone(1046, 1046, 0.32, 'square', 0.32, 0.3);
  }

  /** Batida: pancada grave + trombone triste "fom… fom…". */
  crash() {
    this.noise(0.25, 0.7, 1200, 120);
    this.tone(160, 60, 0.3, 'square', 0.4);
    this.tone(311, 293, 0.28, 'sawtooth', 0.2, 0.3);
    this.tone(293, 277, 0.28, 'sawtooth', 0.2, 0.6);
    this.tone(277, 220, 0.6, 'sawtooth', 0.22, 0.9);
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sem vibração */
  }
}
