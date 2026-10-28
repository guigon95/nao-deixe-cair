/**
 * Base de áudio compartilhada pelos jogos do hub: efeitos sintetizados com Web Audio (sem arquivos de áudio, sem
 * licenças de terceiros). O som é só reforço: nenhuma informação depende dele.
 * O AudioContext é criado/retomado apenas após um gesto do usuário,
 * como exigem as políticas de autoplay dos navegadores.
 */
export class SynthAudio {
  protected ctx: AudioContext | null = null;
  protected master: GainNode | null = null;
  private _enabled = true;

  /** Cada jogo para aqui seus sons contínuos (motor, propulsor). */
  protected stopContinuous(): void {}

  get enabled() {
    return this._enabled;
  }

  set enabled(v: boolean) {
    this._enabled = v;
    if (!v) this.stopContinuous();
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
    this.stopContinuous();
    try {
      if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
    } catch {
      /* ignora */
    }
  }

  protected get ready() {
    return this._enabled && !!this.ctx && !!this.master && this.ctx.state === 'running';
  }

  protected tone(
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

  protected noise(
    duration: number,
    gain: number,
    fromHz: number,
    toHz: number,
    type: BiquadFilterType = 'lowpass',
    delay = 0,
  ) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    try {
      const len = Math.ceil(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
      const t0 = ctx.currentTime + delay;
      f.frequency.setValueAtTime(fromHz, t0);
      f.frequency.exponentialRampToValueAtTime(toHz, t0 + duration);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      src.connect(f).connect(g).connect(this.master!);
      src.start(t0);
      src.stop(t0 + duration + 0.02);
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
