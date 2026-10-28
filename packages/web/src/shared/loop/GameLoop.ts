export interface FrameScheduler {
  request(cb: (time: number) => void): number;
  cancel(id: number): void;
}

export const browserScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

/**
 * Laço único de animação. `start()` é idempotente: chamar duas vezes
 * (ex.: StrictMode do React, reinícios rápidos) nunca cria um segundo laço.
 * O delta é calculado pelo timestamp do requestAnimationFrame, portanto
 * funciona igual em telas de 60, 90, 120 ou 144 Hz.
 */
export class GameLoop {
  private handle: number | null = null;
  private last: number | null = null;
  /** Número de laços ativos — deve ser sempre 0 ou 1. */
  activeLoops = 0;

  constructor(
    private onFrame: (dtSeconds: number, now: number) => void,
    private scheduler: FrameScheduler = browserScheduler,
  ) {}

  get running() {
    return this.handle !== null;
  }

  start(): void {
    if (this.handle !== null) return;
    this.last = null;
    this.activeLoops = 1;
    this.handle = this.scheduler.request(this.tick);
  }

  stop(): void {
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
    this.last = null;
    this.activeLoops = 0;
  }

  /** Descarta o delta pendente (ex.: ao voltar de uma aba oculta). */
  resetClock(): void {
    this.last = null;
  }

  private tick = (now: number) => {
    if (this.handle === null) return;
    const dt = this.last === null ? 0 : Math.max(0, (now - this.last) / 1000);
    this.last = now;
    try {
      this.onFrame(dt, now);
    } catch (err) {
      // Um erro de desenho não deve matar o laço inteiro.
      console.error('[jogo] erro no quadro:', err);
    }
    if (this.handle !== null) this.handle = this.scheduler.request(this.tick);
  };
}
