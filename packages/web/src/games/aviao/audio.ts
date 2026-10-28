import type { ManeuverKind } from './game/types';
import { SynthAudio } from '../../shared/audio/SynthAudio';

/**
 * Sons do Acrobata. A base (desbloqueio, iOS em modo "playback", botões,
 * recorde) vem do hub. Tudo sintetizado: sem arquivos de terceiros.
 */
export class PlaneSfx extends SynthAudio {
  private engOsc: OscillatorNode | null = null;
  private engSub: OscillatorNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private engGain: GainNode | null = null;
  private engAmp: GainNode | null = null;
  private lfo: OscillatorNode | null = null;
  private lfoDepth: GainNode | null = null;
  private lastPress = -1;
  private lastGraze = -1;

  protected override stopContinuous(): void {
    this.engine(false);
  }

  /**
   * Motor contínuo — o "zumbido do propulsor" do Não Deixe Cair original
   * (commit 8b78a0b): serra grave num passa-baixa ressonante (Q≈6), com
   * frequência e brilho subindo com a potência. Para soar como hélice: base
   * de 60–80 Hz, um seno uma oitava abaixo para corpo e um LFO de 8–15 Hz no
   * volume (o "tuc-tuc-tuc" das pás), que acelera com a potência.
   */
  engine(on: boolean, power = 0, speedNorm = 0, slowmo = false): void {
    const ctx = this.ctx;
    if (!on) {
      if (this.engAmp && ctx) this.engAmp.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      return;
    }
    if (!this.ready || !ctx) return;
    try {
      if (!this.engOsc) {
        this.engOsc = ctx.createOscillator();
        this.engOsc.type = 'sawtooth';
        this.engOsc.frequency.value = 64;
        this.engSub = ctx.createOscillator();
        this.engSub.type = 'sine';
        this.engSub.frequency.value = 32;
        this.engFilter = ctx.createBiquadFilter();
        this.engFilter.type = 'lowpass';
        this.engFilter.frequency.value = 400;
        this.engFilter.Q.value = 6;
        // Volume das pás: ganho base + LFO somado ao parâmetro de ganho.
        this.engGain = ctx.createGain();
        this.engGain.gain.value = 0.6;
        this.lfo = ctx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 9;
        this.lfoDepth = ctx.createGain();
        this.lfoDepth.gain.value = 0.35;
        this.lfo.connect(this.lfoDepth).connect(this.engGain.gain);
        this.engAmp = ctx.createGain();
        this.engAmp.gain.value = 0;
        const subGain = ctx.createGain();
        subGain.gain.value = 0.5;
        this.engOsc.connect(this.engFilter);
        this.engSub.connect(subGain).connect(this.engFilter);
        this.engFilter.connect(this.engGain).connect(this.engAmp).connect(this.master!);
        this.engOsc.start();
        this.engSub.start();
        this.lfo.start();
      }
      const t = ctx.currentTime;
      const pitchDrop = slowmo ? 0.7 : 1;
      const f = (62 + power * 18 + speedNorm * 22) * pitchDrop;
      this.engOsc.frequency.setTargetAtTime(f, t, 0.06);
      this.engSub!.frequency.setTargetAtTime(f / 2, t, 0.06);
      this.engFilter!.frequency.setTargetAtTime(300 + power * 1100 + speedNorm * 450, t, 0.06);
      this.lfo!.frequency.setTargetAtTime(8 + power * 7, t, 0.1);
      this.lfoDepth!.gain.setTargetAtTime(0.25 + power * 0.15, t, 0.1);
      this.engAmp!.gain.setTargetAtTime(0.13 + power * 0.1, t, 0.04);
    } catch {
      /* áudio nunca quebra o jogo */
    }
  }

  /** Toque: "tchk" grave e curto do acelerador — confirma o toque na hora. */
  press(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastPress < 0.06) return;
    this.lastPress = now;
    this.tone(150, 240, 0.07, 'triangle', 0.3, 0, 0.003);
    this.noise(0.035, 0.05, 2500, 1200, 'bandpass');
  }

  /** Soltar: suspiro descendo, discreto. */
  release(): void {
    if (!this.ready) return;
    this.tone(260, 160, 0.08, 'sine', 0.1, 0, 0.004);
  }

  /**
   * Som próprio por manobra. A altura sobe com o multiplicador do combo
   * (um semitom por nível), dando a sensação de "escada" ao encadear.
   */
  maneuver(kind: ManeuverKind, multiplier: number): void {
    if (!this.ready) return;
    const up = Math.pow(2, Math.min(multiplier - 1, 10) / 12);
    const n = (f: number, d: number, type: OscillatorType, g: number, delay: number) => this.tone(f * up, f * up, d, type, g, delay);
    switch (kind) {
      case 'loop': // arpejo maior que "dá a volta"
        n(523, 0.1, 'triangle', 0.45, 0);
        n(659, 0.1, 'triangle', 0.45, 0.07);
        n(784, 0.1, 'triangle', 0.45, 0.14);
        n(1046, 0.22, 'triangle', 0.5, 0.21);
        break;
      case 'halfLoop':
        n(523, 0.1, 'triangle', 0.4, 0);
        n(784, 0.18, 'triangle', 0.42, 0.08);
        break;
      case 'rasante': // "zuuum" subindo
        this.tone(300 * up, 900 * up, 0.25, 'sine', 0.35);
        this.noise(0.2, 0.06, 600, 3000, 'bandpass');
        break;
      case 'inverted':
        n(659, 0.12, 'sine', 0.38, 0);
        n(523, 0.12, 'sine', 0.38, 0.09);
        n(784, 0.2, 'sine', 0.4, 0.18);
        break;
      case 'stallRecovery':
        this.tone(220 * up, 660 * up, 0.3, 'triangle', 0.4);
        break;
      case 'graze':
        this.graze();
        break;
      case 'ring': // sininho
        n(1318, 0.18, 'sine', 0.35, 0);
        n(1976, 0.25, 'sine', 0.22, 0.05);
        break;
      case 'roll':
        n(880, 0.08, 'triangle', 0.3, 0);
        n(1175, 0.12, 'triangle', 0.3, 0.06);
        break;
    }
  }

  /** "Fiu" de vento ao raspar perto de um obstáculo. */
  graze(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastGraze < 0.12) return;
    this.lastGraze = now;
    this.noise(0.16, 0.08, 1800, 600, 'bandpass');
  }

  /** Combo perdido: duas notas descendo, suaves. */
  comboLost(): void {
    this.tone(523, 523, 0.08, 'sine', 0.18);
    this.tone(392, 330, 0.18, 'sine', 0.18, 0.08);
  }

  /** Aviso de estol: dois bipes agudos e baixos. */
  stall(): void {
    this.tone(1046, 1046, 0.06, 'square', 0.08);
    this.tone(1046, 1046, 0.06, 'square', 0.08, 0.11);
  }

  /** Raspando no chão: chiado curto e baixo, abafado. */
  skid(): void {
    this.noise(0.18, 0.07, 900, 300, 'lowpass');
  }

  /**
   * Batida: baque grave (seno caindo), "bonk" de triângulo abafado e um
   * chiado curto e baixo. Nada de serrilha nem ruído branco alto — no
   * alto-falante do celular isso estoura.
   */
  crash(): void {
    this.engine(false);
    this.tone(140, 42, 0.38, 'sine', 0.8, 0, 0.004);
    this.tone(300, 120, 0.18, 'triangle', 0.28, 0, 0.003);
    this.noise(0.14, 0.07, 1200, 250, 'lowpass');
    this.tone(392, 392, 0.14, 'triangle', 0.15, 0.24);
    this.tone(294, 247, 0.32, 'triangle', 0.15, 0.38);
  }
}

/** Vibração curta onde existir (Android). No iOS não há API: falha em silêncio. */
export function vibrate(pattern: number | number[]): void {
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern);
  } catch {
    /* sem vibração */
  }
}
