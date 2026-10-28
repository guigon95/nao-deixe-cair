/**
 * Efeitos sonoros sintetizados com Web Audio (sem arquivos de áudio, sem
 * licenças de terceiros). O som é só reforço: nenhuma informação depende dele.
 * O AudioContext é criado/retomado apenas após um gesto do usuário,
 * como exigem as políticas de autoplay dos navegadores.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private thrustOsc: OscillatorNode | null = null;
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;
  private _enabled = true;

  get enabled() {
    return this._enabled;
  }

  set enabled(v: boolean) {
    this._enabled = v;
    if (!v) this.thrust(false);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v ? MASTER_VOLUME : 0, this.ctx.currentTime, 0.02);
  }

  /** Chamar dentro de um gesto do usuário (pointerdown/click/tecla). */
  unlock(): void {
    try {
      // iOS 17+: tipo “playback” faz o som tocar mesmo com a chave de silencioso ligada.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session && session.type !== 'playback') session.type = 'playback';
    } catch {
      /* API ausente na maioria dos navegadores */
    }
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this._enabled ? MASTER_VOLUME : 0;
        // Compressor evita estouro quando vários sons coincidem.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.master.connect(comp).connect(this.ctx.destination);
        // iOS antigo só libera o áudio se algo tocar dentro do gesto: buffer silencioso de 1 amostra.
        const silent = this.ctx.createBufferSource();
        silent.buffer = this.ctx.createBuffer(1, 1, 22050);
        silent.connect(this.ctx.destination);
        silent.start(0);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  suspend(): void {
    this.thrust(false);
    try {
      if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
    } catch {
      /* ignora */
    }
  }

  private get ready() {
    return this._enabled && !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    gain = 1,
    delay = 0,
    attack = 0.006,
  ) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    try {
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(g).connect(this.master!);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    } catch {
      /* áudio nunca deve quebrar o jogo */
    }
  }

  private noise(duration: number, gain: number, fromHz: number, toHz: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    try {
      const len = Math.ceil(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      const t0 = ctx.currentTime;
      f.frequency.setValueAtTime(fromHz, t0);
      f.frequency.exponentialRampToValueAtTime(toHz, t0 + duration);
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(f).connect(g).connect(this.master!);
      src.start();
    } catch {
      /* ignora */
    }
  }

  /**
   * Zumbido contínuo do “propulsor” enquanto o jogador segura.
   * É o retorno sonoro mais importante: confirma na hora que o toque foi lido.
   */
  thrust(on: boolean, rising = 0): void {
    const ctx = this.ctx;
    if (!on) {
      if (this.thrustGain && ctx) {
        this.thrustGain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      }
      return;
    }
    if (!this.ready || !ctx) return;
    try {
      if (!this.thrustOsc) {
        this.thrustOsc = ctx.createOscillator();
        this.thrustOsc.type = 'sawtooth';
        this.thrustOsc.frequency.value = 110;
        this.thrustFilter = ctx.createBiquadFilter();
        this.thrustFilter.type = 'lowpass';
        this.thrustFilter.frequency.value = 500;
        this.thrustFilter.Q.value = 6;
        this.thrustGain = ctx.createGain();
        this.thrustGain.gain.value = 0;
        this.thrustOsc.connect(this.thrustFilter).connect(this.thrustGain).connect(this.master!);
        this.thrustOsc.start();
      }
      const t = ctx.currentTime;
      // A altura do zumbido acompanha a velocidade de subida (0..1).
      this.thrustOsc.frequency.setTargetAtTime(105 + rising * 70, t, 0.05);
      this.thrustFilter!.frequency.setTargetAtTime(420 + rising * 900, t, 0.05);
      this.thrustGain!.gain.setTargetAtTime(0.16, t, 0.02);
    } catch {
      /* ignora */
    }
  }

  /** Clique curto de botão. */
  click() {
    this.tone(880, 660, 0.06, 'triangle', 0.35);
  }

  /** Início de partida: arpejo ascendente curto. */
  start() {
    this.tone(392, 392, 0.09, 'triangle', 0.5);
    this.tone(523, 523, 0.09, 'triangle', 0.5, 0.07);
    this.tone(784, 784, 0.16, 'triangle', 0.55, 0.14);
  }

  /** Bip da contagem de retomada; o último é mais agudo. */
  tick(last = false) {
    this.tone(last ? 988 : 660, last ? 988 : 660, last ? 0.18 : 0.08, 'square', 0.25);
  }

  pass(combo = 0) {
    // Sobe um semitom a cada barreira seguida (até uma oitava): sensação de ritmo.
    const f = 784 * Math.pow(2, Math.min(combo, 12) / 12);
    this.tone(f, f * 1.5, 0.11, 'sine', 0.7);
    this.tone(f * 2, f * 2, 0.07, 'triangle', 0.18, 0.02);
  }

  crash() {
    this.thrust(false);
    this.noise(0.45, 0.9, 3000, 120);
    this.tone(240, 50, 0.45, 'sawtooth', 0.5);
  }

  record() {
    this.tone(523, 523, 0.12, 'triangle', 0.6);
    this.tone(659, 659, 0.12, 'triangle', 0.6, 0.11);
    this.tone(784, 784, 0.12, 'triangle', 0.6, 0.22);
    this.tone(1046, 1318, 0.35, 'triangle', 0.65, 0.33);
  }

  /** Confirmação (salvou no ranking). */
  success() {
    this.tone(660, 660, 0.08, 'sine', 0.5);
    this.tone(990, 990, 0.16, 'sine', 0.5, 0.08);
  }
}

const MASTER_VOLUME = 0.55;
