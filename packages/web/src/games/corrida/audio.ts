import { SynthAudio } from '../../shared/audio/SynthAudio';

/** Música do ímã: forró/baião acelerado, original (Ré mixolídio, I–I–IV–V). */
export const MUSIC = {
  bpm: 172,
  /** Nos 2 últimos segundos do ímã o forró acelera (a corrida acompanha). */
  finalRush: 1.18,
  volume: 0.32,
  /** Ré 4 (Hz): as notas da melodia são semitons a partir dele. */
  d4: 293.66,
  /** Fundamentais do baixo por compasso: Ré, Ré, Sol, Lá. */
  bassRoots: [73.42, 73.42, 98.0, 110.0],
} as const;

/** Passos (de 16) em que o baixo toca: 3-3-2 dobrado. */
const BAIAO_BASS = [0, 3, 6, 8, 11, 14];

const _ = null;
/** 4 compassos × 16 semicolcheias (semitons a partir do Ré 4; null = pausa). */
const MELODY: ReadonlyArray<ReadonlyArray<number | null>> = [
  [12, _, 7, _, 4, 7, 12, _, 10, _, 7, _, 4, _, 7, _],
  [9, _, 7, _, 4, _, 2, _, 4, 7, 9, _, 7, _, _, _],
  [5, _, 9, _, 12, _, 14, 12, 10, _, 9, _, 7, _, 5, _],
  [7, _, 11, _, 14, _, 16, 14, 11, _, 9, _, 7, 9, 11, _],
];

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
    this.musicStop();
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

  // ───────────── música do ímã (forró acelerado, composição original) ─────────────

  private music: { gain: GainNode; noise: AudioBuffer; next: number; step: number } | null = null;

  /** Tocando a música do ímã agora? */
  get musicPlaying(): boolean {
    return !!this.music;
  }

  /**
   * Chamar a cada quadro enquanto o ímã estiver ligado: agenda as notas dos
   * próximos ~120 ms (agendamento à frente no relógio do áudio, sem timers).
   * `remaining` = segundos de ímã que faltam: nos 2 últimos, o forró acelera.
   */
  musicTick(remaining: number): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    try {
      if (!this.music) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(MUSIC.volume, ctx.currentTime + 0.15);
        gain.connect(this.master!);
        const len = Math.ceil(ctx.sampleRate * 0.08);
        const noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.music = { gain, noise, next: ctx.currentTime + 0.03, step: 0 };
      }
      const m = this.music;
      const bpm = remaining < 2 ? MUSIC.bpm * MUSIC.finalRush : MUSIC.bpm;
      const stepDur = 60 / bpm / 4;
      while (m.next < ctx.currentTime + 0.12) {
        this.playStep(m.step, m.next, stepDur);
        m.next += stepDur;
        m.step = (m.step + 1) % 64;
      }
    } catch {
      /* áudio nunca quebra o jogo */
    }
  }

  musicStop(): void {
    const m = this.music;
    if (!m || !this.ctx) return;
    this.music = null;
    try {
      const t = this.ctx.currentTime;
      m.gain.gain.cancelScheduledValues(t);
      m.gain.gain.setValueAtTime(Math.max(0.0001, m.gain.gain.value), t);
      m.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      setTimeout(() => m.gain.disconnect(), 400);
    } catch {
      /* ignora */
    }
  }

  /** Um passo (semicolcheia) do loop de 4 compassos: zabumba, triângulo, baixo e sanfona. */
  private playStep(step: number, t: number, stepDur: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // Zabumba: batida grave no 1 e no "e do 2" (pulsação do baião).
    if (s === 0 || s === 6 || s === 8) this.mNote(s === 0 ? 95 : 80, t, 0.12, 'sine', 0.9, 45);
    // Triângulo: todo passo, aberto nos contratempos.
    const open = s % 4 === 2;
    this.mTick(t, open ? 0.07 : 0.025, open ? 0.32 : 0.12);
    // Baixo no ritmo 3-3-2 do baião.
    const bi = BAIAO_BASS.indexOf(s);
    if (bi >= 0) {
      const root = MUSIC.bassRoots[bar];
      this.mNote(root * (bi % 2 === 1 ? 1.5 : 1), t, stepDur * 1.6, 'triangle', 0.55);
    }
    // Melodia (sanfona: quadrada + serra, uma oitava junta, bem curtinha).
    const n = MELODY[bar][s];
    if (n !== null) {
      const f = MUSIC.d4 * Math.pow(2, n / 12);
      this.mNote(f, t, stepDur * 1.7, 'square', 0.22);
      this.mNote(f * 2, t, stepDur * 1.2, 'sawtooth', 0.06);
    }
  }

  private mNote(freq: number, t0: number, dur: number, type: OscillatorType, gain: number, endFreq = freq): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.music!.gain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private mTick(t0: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.music!.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.music!.gain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Escudo: ao pegar, brilho subindo; ao salvar, "ploft" de folha + acorde. */
  shield(on: boolean): void {
    if (on) {
      this.tone(523, 784, 0.18, 'triangle', 0.3);
      this.tone(784, 1046, 0.22, 'sine', 0.22, 0.08);
    } else {
      this.noise(0.18, 0.14, 1600, 300, 'lowpass');
      this.tone(392, 392, 0.1, 'triangle', 0.35, 0.05);
      this.tone(587, 587, 0.18, 'triangle', 0.35, 0.12);
    }
  }

  /** Açaí: "glup" gostoso + o acorde da Disparada pronta. */
  acai(): void {
    this.tone(260, 520, 0.12, 'sine', 0.3);
    this.tone(330, 660, 0.12, 'sine', 0.25, 0.09);
    this.meterFull();
  }

  /** Toca: entrar (folhas rasgando + tombo abafado) ou sair (pulo de mola de terra). */
  burrow(on: boolean): void {
    if (on) {
      this.noise(0.2, 0.12, 2400, 600, 'bandpass');
      this.tone(160, 70, 0.16, 'sine', 0.35, 0.12);
    } else {
      this.noise(0.12, 0.08, 900, 300, 'lowpass');
      this.tone(330, 990, 0.18, 'triangle', 0.3);
    }
  }

  /**
   * "U-HUUL!" da capivara saindo da toca: voz sintetizada (fonte dente-de-serra
   * passando por filtros de formante da vogal "u"). Uma sílaba curta, um
   * soprinho de "h" e um "HUUUL" que sobe de tom e cai no fim (o "l" abre o
   * segundo formante).
   */
  uhul(): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    try {
      const t0 = ctx.currentTime + 0.01;
      const voice = ctx.createGain();
      voice.gain.value = 0.9;
      voice.connect(this.master!);
      // Formantes em paralelo.
      const formants: Array<[number, number, number]> = [
        [360, 6, 1],
        [820, 9, 0.55],
        [2500, 12, 0.12],
      ];
      const amp = ctx.createGain();
      const filters = formants.map(([f, q, g]) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        const fg = ctx.createGain();
        fg.gain.value = g * 3;
        amp.connect(bp).connect(fg).connect(voice);
        return bp;
      });
      // "l" no fim: F1 e F2 abrem.
      filters[0].frequency.setValueAtTime(360, t0 + 0.42);
      filters[0].frequency.linearRampToValueAtTime(430, t0 + 0.6);
      filters[1].frequency.setValueAtTime(820, t0 + 0.42);
      filters[1].frequency.linearRampToValueAtTime(1200, t0 + 0.6);
      // Fonte: dente-de-serra com vibrato leve e curva de entonação.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f = osc.frequency;
      f.setValueAtTime(330, t0);
      f.linearRampToValueAtTime(300, t0 + 0.12);
      f.setValueAtTime(430, t0 + 0.17);
      f.exponentialRampToValueAtTime(600, t0 + 0.32);
      f.exponentialRampToValueAtTime(390, t0 + 0.64);
      const vib = ctx.createOscillator();
      vib.frequency.value = 6.5;
      const vibAmt = ctx.createGain();
      vibAmt.gain.value = 9;
      vib.connect(vibAmt).connect(f);
      osc.connect(amp);
      // Envelope: "u" curto, pausa, "HUUUL" longo.
      const a = amp.gain;
      a.setValueAtTime(0.0001, t0);
      a.exponentialRampToValueAtTime(0.5, t0 + 0.03);
      a.setValueAtTime(0.5, t0 + 0.1);
      a.exponentialRampToValueAtTime(0.02, t0 + 0.14);
      a.setValueAtTime(0.02, t0 + 0.17);
      a.exponentialRampToValueAtTime(0.75, t0 + 0.21);
      a.setValueAtTime(0.75, t0 + 0.45);
      a.exponentialRampToValueAtTime(0.0001, t0 + 0.68);
      osc.start(t0);
      vib.start(t0);
      osc.stop(t0 + 0.7);
      vib.stop(t0 + 0.7);
      osc.onended = () => voice.disconnect();
      // Soprinho do "h" entre as sílabas.
      this.noise(0.07, 0.07, 1600, 1100, 'bandpass', 0.14);
    } catch {
      /* áudio nunca quebra o jogo */
    }
  }

  /** Caixote premiado abrindo: "plim" de surpresa (mais brilhante se for item). */
  loot(item: boolean): void {
    const base = item ? 880 : 660;
    this.tone(base, base * 1.5, 0.12, 'triangle', 0.3);
    this.tone(base * 1.5, base * 2, 0.16, 'sine', 0.22, 0.08);
  }

  /** Ema: aparece (tum-tum grave, o "bum" da ema), monta (fanfarra curta) ou sai (piado). */
  ema(phase: 'appear' | 'ride' | 'off'): void {
    if (phase === 'appear') {
      this.tone(120, 90, 0.18, 'sine', 0.45);
      this.tone(110, 80, 0.2, 'sine', 0.4, 0.22);
    } else if (phase === 'ride') {
      this.tone(392, 392, 0.08, 'square', 0.18);
      this.tone(523, 523, 0.08, 'square', 0.18, 0.08);
      this.tone(659, 659, 0.08, 'square', 0.18, 0.16);
      this.tone(784, 784, 0.2, 'square', 0.2, 0.24);
    } else {
      this.tone(900, 1400, 0.08, 'triangle', 0.25);
      this.tone(1300, 700, 0.14, 'triangle', 0.22, 0.08);
    }
  }

  /** Capim dourado: arpejo brilhante subindo (ao pegar) ou descendo (acabou). */
  golden(on: boolean): void {
    const notes = on ? [784, 988, 1175, 1568] : [1175, 988, 784];
    notes.forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.24, i * 0.06));
    if (on) this.tone(2093, 2093, 0.3, 'sine', 0.12, 0.26);
  }

  /** Jacaré fechando a boca: "nhac" seco e grave. */
  chomp(): void {
    this.tone(180, 70, 0.09, 'square', 0.22, 0, 0.002);
    this.noise(0.06, 0.12, 1800, 400, 'lowpass');
  }

  /** Jacaré saindo da água: respingo curto. */
  splashSmall(): void {
    this.noise(0.22, 0.08, 2600, 500, 'lowpass');
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
