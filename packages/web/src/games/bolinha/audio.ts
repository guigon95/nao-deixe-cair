import { SynthAudio } from '../../shared/audio/SynthAudio';
import type { TrailId } from './game/cosmetics';

/** Sons próprios do jogo da bolinha; a base (desbloqueio, iOS, botões) é compartilhada. */
export class Sfx extends SynthAudio {
  private thrustSrc: AudioBufferSourceNode | null = null;
  private lastPress = -1;
  private thrustGain: GainNode | null = null;
  private thrustFilter: BiquadFilterNode | null = null;
  /** Som do toque/propulsor combina com o rastro escolhido na loja. */
  style: TrailId = 'padrao';
  /** Próximo instante de um detalhe enquanto segura (bolha, faísca, brilho). */
  private nextDetail = 0;

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
      // Cor do sopro por rastro: bolhas = água abafada, fogo = ronco grave,
      // arco-íris/estrelas = brilho agudo e mais baixo.
      const tone = THRUST_TONE[this.style];
      this.thrustFilter!.frequency.setTargetAtTime(tone.freq + rising * tone.rise, t, 0.08);
      this.thrustGain!.gain.setTargetAtTime((0.09 + rising * 0.05) * tone.gain, t, 0.05);
      // Detalhes esparsos enquanto segura (nunca mais que ~6 por segundo).
      if (this.style !== 'padrao' && t >= this.nextDetail) {
        this.nextDetail = t + 0.14 + Math.random() * 0.22;
        this.holdDetail(rising);
      }
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
    this.nextDetail = now + 0.12;
    const j = Math.random(); // leve variação: não soa repetitivo
    switch (this.style) {
      case 'bolhas': {
        // "blup-blup": duas bolhas subindo de tom, com estalinho no fim
        const f = 300 + j * 80;
        this.tone(f, f * 2.6, 0.07, 'sine', 0.3, 0, 0.004);
        this.tone(f * 1.35, f * 3.2, 0.06, 'sine', 0.22, 0.065, 0.004);
        this.noise(0.02, 0.03, 3000, 2000, 'bandpass', 0.12);
        break;
      }
      case 'arco-iris': {
        // acorde brilhante de pentatônica (sempre afinado)
        const root = PENTA[Math.floor(j * PENTA.length)];
        this.tone(root, root, 0.12, 'triangle', 0.2);
        this.tone(root * 1.25, root * 1.25, 0.12, 'triangle', 0.15, 0.035);
        this.tone(root * 1.5, root * 1.5, 0.16, 'sine', 0.14, 0.07);
        break;
      }
      case 'estrelas': {
        // "tin-tin" agudo de sininho
        const f = 1568 + j * 200;
        this.tone(f, f, 0.09, 'triangle', 0.18, 0, 0.002);
        this.tone(f * 1.5, f * 1.5, 0.14, 'sine', 0.12, 0.06, 0.002);
        break;
      }
      case 'fogo': {
        // "fuuush" de labareda: sopro subindo + tum grave
        this.noise(0.16, 0.16, 350, 1600, 'bandpass');
        this.tone(140 + j * 20, 80, 0.12, 'sine', 0.28, 0, 0.004);
        break;
      }
      default: {
        const f = 520 + j * 40;
        this.tone(f, f * 1.9, 0.07, 'sine', 0.32, 0, 0.003);
        this.noise(0.04, 0.06, 4000, 2500, 'highpass');
      }
    }
  }

  /** Soltar: discreto, descendo, no estilo do rastro. */
  release(): void {
    if (!this.ready) return;
    switch (this.style) {
      case 'bolhas':
        this.tone(900, 1400, 0.03, 'sine', 0.1, 0, 0.002); // "plic" da bolha estourando
        break;
      case 'arco-iris':
      case 'estrelas':
        this.tone(1046, 784, 0.08, 'sine', 0.07, 0, 0.004);
        break;
      case 'fogo':
        this.noise(0.08, 0.06, 900, 300, 'lowpass');
        break;
      default:
        this.tone(480, 300, 0.06, 'sine', 0.1, 0, 0.004);
    }
  }

  /** Detalhe enquanto segura: bolhinha, faísca de fogo ou brilho. */
  private holdDetail(rising: number) {
    const j = Math.random();
    switch (this.style) {
      case 'bolhas': {
        const f = 380 + j * 260 + rising * 120;
        this.tone(f, f * 2.2, 0.05, 'sine', 0.12, 0, 0.003);
        break;
      }
      case 'fogo':
        this.noise(0.025, 0.07, 2500 + j * 2000, 1500, 'highpass'); // estalo de brasa
        break;
      case 'arco-iris': {
        const f = PENTA[Math.floor(j * PENTA.length)] * 2;
        this.tone(f, f, 0.08, 'sine', 0.06, 0, 0.004);
        break;
      }
      case 'estrelas': {
        const f = 2093 + j * 600;
        this.tone(f, f, 0.05, 'triangle', 0.07, 0, 0.002);
        break;
      }
    }
  }

  pass(combo = 0) {
    // Sobe um semitom a cada barreira seguida (até uma oitava): sensação de ritmo.
    const f = 784 * Math.pow(2, Math.min(combo, 12) / 12);
    this.tone(f, f * 1.5, 0.11, 'sine', 0.7);
    this.tone(f * 2, f * 2, 0.07, 'triangle', 0.18, 0.02);
  }

  /** Moeda: "plim" curto e brilhante, mais baixo que a passagem. */
  coin(streak = 0) {
    const f = 1319 * Math.pow(2, Math.min(streak, 7) / 12);
    this.tone(f, f, 0.06, 'triangle', 0.32);
    this.tone(f * 1.335, f * 1.335, 0.14, 'sine', 0.3, 0.05);
  }

  /**
   * Macaquinho na selva: "uh-uh-ah!" curto e baixinho (sintetizado, sem
   * arquivo). Tocado de vez em quando, nunca em sequência.
   */
  monkey() {
    const v = 0.1;
    const base = 430 + Math.random() * 80;
    for (let i = 0; i < 3; i++) {
      const f = base * (1 + i * 0.12);
      this.tone(f, f * 1.45, 0.09, 'sine', v, i * 0.12, 0.012);
      this.tone(f * 2, f * 2.6, 0.07, 'triangle', v * 0.25, i * 0.12, 0.012);
    }
    this.tone(base * 1.7, base * 1.15, 0.22, 'sine', v * 1.1, 0.4, 0.02);
    this.tone(base * 3.4, base * 2.2, 0.18, 'triangle', v * 0.22, 0.4, 0.02);
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

/** Notas da pentatônica de Dó (C5 D5 E5 G5 A5): qualquer combinação soa bem. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880];

/** Filtro/volume do sopro contínuo por rastro. */
const THRUST_TONE: Record<TrailId, { freq: number; rise: number; gain: number }> = {
  padrao: { freq: 650, rise: 700, gain: 1 },
  bolhas: { freq: 320, rise: 260, gain: 0.8 },
  'arco-iris': { freq: 1800, rise: 900, gain: 0.55 },
  estrelas: { freq: 2400, rise: 900, gain: 0.45 },
  fogo: { freq: 380, rise: 420, gain: 1.2 },
};
