/**
 * Efeitos sonoros sintetizados com Web Audio (sem arquivos de áudio, sem
 * licenças de terceiros). O som é só reforço: nenhuma informação depende dele.
 * O AudioContext é criado/retomado apenas após um gesto do usuário,
 * como exigem as políticas de autoplay dos navegadores.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  /** Chamar dentro de um gesto do usuário (pointerdown/click). */
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  suspend(): void {
    try {
      if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
    } catch {
      /* ignora */
    }
  }

  private tone(freq: number, endFreq: number, duration: number, type: OscillatorType, gain = 1, delay = 0) {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(this.master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch {
      /* áudio nunca deve quebrar o jogo */
    }
  }

  pass() {
    this.tone(660, 990, 0.08, 'sine', 0.7);
  }

  crash() {
    this.tone(220, 55, 0.35, 'sawtooth', 0.6);
    this.tone(110, 40, 0.4, 'square', 0.3);
  }

  record() {
    this.tone(523, 523, 0.1, 'triangle', 0.7);
    this.tone(659, 659, 0.1, 'triangle', 0.7, 0.1);
    this.tone(784, 1046, 0.2, 'triangle', 0.7, 0.2);
  }
}
