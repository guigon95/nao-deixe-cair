import { SynthAudio } from '../../shared/audio/SynthAudio';

/** Escala pentatônica (semitons) da sequência de capins. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

/**
 * Sons da Disparada. A base (desbloqueio após gesto, iOS em "playback",
 * botões, recorde) vem do hub. Tudo sintetizado: nenhum arquivo de terceiros.
 * O jogo é 100% jogável sem som — o zumbido do enxame tem equivalente visual
 * (borda vermelha).
 */
export class RunnerSfx extends SynthAudio {
  private buzzOsc: OscillatorNode | null = null;
  private buzzLfo: OscillatorNode | null = null;
  private buzzAmp: GainNode | null = null;
  private lastFruit = -1;
  private rainSrc: AudioBufferSourceNode | null = null;
  private rainAmp: GainNode | null = null;

  protected override stopContinuous(): void {
    this.buzz(0);
    this.rain(0);
  }

  /** Pulo: "boing" curtinho subindo. */
  jump(): void {
    this.tone(330, 620, 0.11, 'triangle', 0.32, 0, 0.003);
  }

  /** Pouso: baque abafado (mais forte se veio de muito alto). */
  land(hard: boolean): void {
    this.tone(hard ? 150 : 190, hard ? 70 : 110, hard ? 0.12 : 0.07, 'sine', hard ? 0.45 : 0.22, 0, 0.002);
  }

  /** Capim: "nhac" crocante (mastigada) + nota que sobe de tom em sequência. */
  fruit(streak: number): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    // Dois capins no mesmo instante: um som só (evita estouro).
    if (now - this.lastFruit < 0.03) return;
    this.lastFruit = now;
    const step = PENTA[Math.min(PENTA.length - 1, Math.max(0, streak - 1))];
    const f = 880 * Math.pow(2, step / 12);
    this.noise(0.045, 0.09, 3200, 1400, 'bandpass');
    this.tone(f, f, 0.09, 'sine', 0.26, 0.02);
    this.tone(f * 2, f * 2, 0.06, 'sine', 0.1, 0.02);
  }

  /** Medidor cheio: acorde curto ascendente. */
  meterFull(): void {
    this.tone(523, 523, 0.08, 'triangle', 0.35);
    this.tone(784, 784, 0.08, 'triangle', 0.35, 0.06);
    this.tone(1046, 1046, 0.16, 'triangle', 0.4, 0.12);
  }

  /** Caixote: madeira quebrando (estalo + ruído curto). */
  crate(stomp: boolean): void {
    this.noise(0.12, 0.16, 1800, 500, 'bandpass');
    this.tone(stomp ? 520 : 220, stomp ? 780 : 120, 0.1, 'triangle', 0.25);
  }

  /** Dash quebrando pedra. */
  smash(): void {
    this.noise(0.18, 0.18, 900, 200, 'lowpass');
    this.tone(120, 60, 0.15, 'sine', 0.4);
  }

  spring(): void {
    this.tone(200, 900, 0.22, 'sine', 0.4, 0, 0.003);
    this.tone(300, 1200, 0.18, 'triangle', 0.15, 0.03);
  }

  /** Agarrou o cipó: "vuuup" curto. Soltou: assobio subindo. */
  vine(on: boolean): void {
    if (on) {
      this.noise(0.12, 0.06, 900, 2200, 'bandpass');
      this.tone(260, 360, 0.12, 'triangle', 0.22);
    } else this.tone(420, 900, 0.18, 'sine', 0.28);
  }

  /** Ímã: "vuuum" subindo ao pegar; ao acabar, duas notas descendo bem baixinho. */
  magnet(on: boolean): void {
    if (on) {
      this.tone(220, 880, 0.3, 'sawtooth', 0.12);
      this.tone(440, 1320, 0.3, 'sine', 0.25, 0.04);
    } else {
      this.tone(660, 660, 0.08, 'sine', 0.15);
      this.tone(440, 392, 0.14, 'sine', 0.15, 0.08);
    }
  }

  /** Chegou à copa: farfalhar de folhas + duas notas subindo. */
  canopy(): void {
    this.noise(0.25, 0.08, 2600, 900, 'bandpass');
    this.tone(587, 587, 0.1, 'triangle', 0.3, 0.05);
    this.tone(880, 880, 0.16, 'triangle', 0.32, 0.13);
  }

  dash(): void {
    this.noise(0.35, 0.12, 400, 2600, 'bandpass');
    this.tone(220, 660, 0.3, 'sawtooth', 0.12);
  }

  glide(): void {
    this.noise(0.25, 0.04, 2400, 1200, 'bandpass');
  }

  fastFall(): void {
    this.tone(700, 200, 0.12, 'sine', 0.2);
  }

  /** Derrota: baque grave e duas notas descendo (sem ruído alto). */
  crash(): void {
    this.buzz(0);
    this.tone(150, 45, 0.35, 'sine', 0.75, 0, 0.004);
    this.noise(0.12, 0.06, 1200, 250, 'lowpass');
    this.tone(392, 392, 0.14, 'triangle', 0.15, 0.24);
    this.tone(294, 247, 0.32, 'triangle', 0.15, 0.38);
  }

  /** Splash no rio. */
  splash(): void {
    this.noise(0.4, 0.14, 3000, 400, 'lowpass');
    this.tone(500, 180, 0.2, 'sine', 0.2);
  }

  /** Chuva contínua: ruído filtrado em loop, volume pela intensidade (0..1). */
  rain(level: number): void {
    const ctx = this.ctx;
    if (level <= 0.01) {
      if (this.rainAmp && ctx) this.rainAmp.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      return;
    }
    if (!this.ready || !ctx) return;
    try {
      if (!this.rainSrc) {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.rainSrc = ctx.createBufferSource();
        this.rainSrc.buffer = buf;
        this.rainSrc.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 900;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 5000;
        this.rainAmp = ctx.createGain();
        this.rainAmp.gain.value = 0;
        this.rainSrc.connect(hp).connect(lp).connect(this.rainAmp).connect(this.master!);
        this.rainSrc.start();
      }
      this.rainAmp!.gain.setTargetAtTime(0.07 * level, ctx.currentTime, 0.3);
    } catch {
      /* áudio nunca quebra o jogo */
    }
  }

  /** Trovão distante: ronco grave e abafado (nada de estouro no alto-falante do celular). */
  thunder(): void {
    this.noise(1.6, 0.16, 300, 60, 'lowpass', 0.25);
    this.tone(70, 40, 1.2, 'sine', 0.25, 0.25, 0.08);
  }

  /**
   * Zumbido contínuo do enxame: volume pela proximidade (0 = longe, 1 = colado).
   * Serra grave com tremolo rápido, abafada num passa-baixa.
   */
  buzz(level: number): void {
    const ctx = this.ctx;
    if (level <= 0.01) {
      if (this.buzzAmp && ctx) this.buzzAmp.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      return;
    }
    if (!this.ready || !ctx) return;
    try {
      if (!this.buzzOsc) {
        this.buzzOsc = ctx.createOscillator();
        this.buzzOsc.type = 'sawtooth';
        this.buzzOsc.frequency.value = 210;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        const trem = ctx.createGain();
        trem.gain.value = 0.6;
        this.buzzLfo = ctx.createOscillator();
        this.buzzLfo.frequency.value = 23;
        const depth = ctx.createGain();
        depth.gain.value = 0.35;
        this.buzzLfo.connect(depth).connect(trem.gain);
        this.buzzAmp = ctx.createGain();
        this.buzzAmp.gain.value = 0;
        this.buzzOsc.connect(filter).connect(trem).connect(this.buzzAmp).connect(this.master!);
        this.buzzOsc.start();
        this.buzzLfo.start();
      }
      const t = ctx.currentTime;
      this.buzzAmp!.gain.setTargetAtTime(0.16 * level, t, 0.1);
      this.buzzOsc.frequency.setTargetAtTime(190 + level * 70, t, 0.1);
    } catch {
      /* áudio nunca quebra o jogo */
    }
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
