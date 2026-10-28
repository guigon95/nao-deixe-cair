import { SynthAudio } from '../../shared/audio/SynthAudio';

/** Sons próprios do jogo da bolinha; a base (desbloqueio, iOS, botões) é compartilhada. */
export class Sfx extends SynthAudio {
  private thrustSrc: AudioBufferSourceNode | null = null;
  private lastPress = -1;
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;

  protected override stopContinuous(): void {
    this.thrust(false);
  }

  /**
   * Sopro suave do “propulsor” enquanto o jogador segura: ruído filtrado em
   * banda, baixinho, que fica mais agudo conforme a bolinha sobe. Fica no
   * fundo, sem cansar o ouvido em partidas longas.
   */
  thrust(on: boolean, rising = 0): void {
    const ctx = this.ctx;
    if (!on) {
      if (this.thrustGain && ctx) this.thrustGain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
      return;
    }
    if (!this.ready || !ctx) return;
    try {
      if (!this.thrustSrc) {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        // Ruído “rosado” simples (média móvel): mais macio que ruído branco.
        let last = 0;
        for (let i = 0; i < len; i++) {
          last = last * 0.85 + (Math.random() * 2 - 1) * 0.15;
          data[i] = last * 3;
        }
        this.thrustSrc = ctx.createBufferSource();
        this.thrustSrc.buffer = buf;
        this.thrustSrc.loop = true;
        this.thrustFilter = ctx.createBiquadFilter();
        this.thrustFilter.type = 'bandpass';
        this.thrustFilter.frequency.value = 700;
        this.thrustFilter.Q.value = 0.9;
        this.thrustGain = ctx.createGain();
        this.thrustGain.gain.value = 0;
        this.thrustSrc.connect(this.thrustFilter).connect(this.thrustGain).connect(this.master!);
        this.thrustSrc.start();
      }
      const t = ctx.currentTime;
      this.thrustFilter!.frequency.setTargetAtTime(650 + rising * 700, t, 0.08);
      this.thrustGain!.gain.setTargetAtTime(0.09 + rising * 0.05, t, 0.05);
    } catch {
      /* ignora */
    }
  }

  /**
   * Toque na tela: “pop” curto e agudo (bolha) que confirma o toque na hora.
   * Limitado a um a cada 70 ms para toques muito rápidos não embolarem.
   */
  press(): void {
    if (!this.ready) return;
    const now = this.ctx!.currentTime;
    if (now - this.lastPress < 0.07) return;
    this.lastPress = now;
    const f = 520 + Math.random() * 40; // leve variação: não soa repetitivo
    this.tone(f, f * 1.9, 0.07, 'sine', 0.32, 0, 0.003);
    this.noise(0.04, 0.06, 4000, 2500, 'highpass');
  }

  /** Soltar: “puff” bem discreto, descendo. */
  release(): void {
    if (!this.ready) return;
    this.tone(480, 300, 0.06, 'sine', 0.1, 0, 0.004);
  }

  pass(combo = 0) {
    // Sobe um semitom a cada barreira seguida (até uma oitava): sensação de ritmo.
    const f = 784 * Math.pow(2, Math.min(combo, 12) / 12);
    this.tone(f, f * 1.5, 0.11, 'sine', 0.7);
    this.tone(f * 2, f * 2, 0.07, 'triangle', 0.18, 0.02);
  }

  /**
   * Batida: baque grave (seno caindo), “bonk” abafado e um chiado curto e
   * bem baixo. Nada de serrilha nem ruído alto — impacto sem estourar.
   */
  crash() {
    this.thrust(false);
    this.tone(150, 48, 0.32, 'sine', 0.75, 0, 0.004); // baque
    this.tone(330, 140, 0.16, 'triangle', 0.28, 0, 0.003); // bonk
    this.noise(0.12, 0.08, 1400, 300, 'lowpass'); // textura do impacto
    // “Perdeu”: duas notas descendo, suaves.
    this.tone(392, 392, 0.14, 'triangle', 0.16, 0.2);
    this.tone(294, 262, 0.3, 'triangle', 0.16, 0.34);
  }

}
