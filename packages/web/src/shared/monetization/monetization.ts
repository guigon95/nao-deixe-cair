import type { MonetizationConfig } from './config';
import { InterstitialPolicy, type PolicyStore } from './policy';
import type { AdHooks, AdProvider, InterstitialOutcome, RewardOutcome } from './types';

/**
 * Fachada única de monetização para os jogos.
 *
 * Garantias (todas cobertas por testes):
 *  - erro ou silêncio da rede nunca trava o jogo (tempos-limite, try/catch);
 *  - um intersticial por vez: cliques repetidos recebem a mesma promessa;
 *  - impressão só conta quando o anúncio aparece (não quando é pedido);
 *  - recompensa só com confirmação da rede (`viewed`), consumida uma única vez;
 *  - callbacks repetidos ou atrasados são ignorados.
 */

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

const realTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
};

export type OfferStatus =
  /** Perguntando à rede se há anúncio. */
  | 'loading'
  /** Há anúncio: o botão pode ser oferecido. */
  | 'ready'
  /** Sem anúncio agora (ou anúncios desligados). */
  | 'unavailable'
  /** Anúncio na tela. */
  | 'showing'
  /** Viu até o fim: recompensa confirmada. */
  | 'rewarded'
  /** Fechou antes do fim. */
  | 'dismissed'
  | 'error'
  /** O jogador seguiu adiante sem ver (ou a partida mudou). */
  | 'cancelled';

const FINAL: ReadonlySet<OfferStatus> = new Set(['unavailable', 'rewarded', 'dismissed', 'error', 'cancelled']);

/**
 * Uma oferta de anúncio com recompensa (ex.: reviver). Nasce perguntando à
 * rede; o jogo mostra o botão quando `status === 'ready'` e chama `show()`
 * no clique do jogador. A recompensa sai por `claim()`, que só devolve true
 * uma vez e só depois da confirmação da rede.
 */
export class RewardedOffer {
  private _status: OfferStatus = 'loading';
  private listeners = new Set<() => void>();
  private showFn: (() => void) | null = null;
  private viewed = false;
  private claimed = false;
  private waiters: Array<(r: RewardOutcome) => void> = [];

  constructor(readonly key: string) {}

  get status(): OfferStatus {
    return this._status;
  }

  get settled(): boolean {
    return FINAL.has(this._status);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** O jogador escolheu ver. Cliques repetidos recebem a mesma resposta. */
  show(): Promise<RewardOutcome> {
    if (this._status === 'ready') {
      const fn = this.showFn;
      this.showFn = null;
      this.set('showing');
      try {
        fn?.();
      } catch {
        this.finish('error');
      }
    }
    if (this._status === 'showing') return new Promise((res) => this.waiters.push(res));
    return Promise.resolve(this.outcome());
  }

  /** Entrega a recompensa uma única vez (true) — só se a rede confirmou. */
  claim(): boolean {
    if (this._status !== 'rewarded' || this.claimed) return false;
    this.claimed = true;
    return true;
  }

  /** Desiste da oferta (jogador seguiu adiante). Não afeta um anúncio já na tela. */
  cancel(): void {
    if (this._status === 'loading' || this._status === 'ready') {
      this.showFn = null;
      this.finish('cancelled');
    }
  }

  // --- uso interno da fachada ---

  /** @internal */ _available(show: () => void): void {
    if (this._status !== 'loading') return;
    this.showFn = show;
    this.set('ready');
  }

  /** @internal */ _viewed(): void {
    if (this._status === 'showing') this.viewed = true;
  }

  /** @internal Encerra; `hint` é o que a rede disse, mas `viewed` manda. */
  _end(hint: OfferStatus): void {
    if (this.settled) return;
    if (this._status === 'showing') this.finish(this.viewed ? 'rewarded' : hint === 'error' ? 'error' : 'dismissed');
    else this.finish(hint === 'error' ? 'error' : 'unavailable');
  }

  private outcome(): RewardOutcome {
    switch (this._status) {
      case 'rewarded':
        return 'rewarded';
      case 'dismissed':
        return 'dismissed';
      case 'error':
        return 'error';
      default:
        return 'unavailable';
    }
  }

  private finish(s: OfferStatus): void {
    if (this.settled) return;
    this.set(s);
    const out = this.outcome();
    for (const w of this.waiters.splice(0)) w(out);
  }

  private set(s: OfferStatus): void {
    this._status = s;
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch {
        /* ouvinte com erro não derruba o fluxo */
      }
    }
  }
}

export interface MonetizationOptions {
  config: MonetizationConfig;
  provider: AdProvider;
  now?: () => number;
  timers?: Timers;
  store?: PolicyStore;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

export class Monetization {
  readonly config: MonetizationConfig;
  readonly policy: InterstitialPolicy;
  private readonly provider: AdProvider;
  private readonly timers: Timers;
  private readonly log: (event: string, data?: Record<string, unknown>) => void;
  private initialized = false;
  private interstitialInFlight: Promise<InterstitialOutcome> | null = null;
  private lastRunKey: string | null = null;
  private offer: RewardedOffer | null = null;

  constructor(opts: MonetizationOptions) {
    this.config = opts.config;
    this.provider = opts.provider;
    this.timers = opts.timers ?? realTimers;
    this.log = opts.log ?? (() => {});
    const now = opts.now ?? (() => Date.now());
    this.policy = new InterstitialPolicy(
      { everyRuns: opts.config.interstitial.everyRuns, minIntervalMs: opts.config.interstitial.minIntervalMs },
      now,
      opts.store,
    );
  }

  /** Há alguma rede de anúncios ativa (real ou simulada em dev)? */
  get active(): boolean {
    return this.provider.id !== 'off';
  }

  get providerId(): AdProvider['id'] {
    return this.provider.id;
  }

  /** Revives por anúncio que o jogo deve permitir por partida (0 com anúncios desligados). */
  get revivesPerRun(): number {
    return this.active ? this.config.rewarded.revivesPerRun : 0;
  }

  /** Carrega o SDK da rede (uma vez). Chamar só na página do jogo que usa anúncios. */
  init(): void {
    if (this.initialized || !this.active) return;
    this.initialized = true;
    guard(() => this.provider.init());
  }

  setSound(on: boolean): void {
    if (this.active) guard(() => this.provider.setSound(on));
  }

  /** Uma partida terminou de vez. Idempotente por `runKey` (callbacks repetidos / re-render). */
  runCompleted(runKey: string): void {
    if (runKey === this.lastRunKey) return;
    this.lastRunKey = runKey;
    this.policy.runCompleted();
  }

  /**
   * Transição natural entre partidas (o jogador pediu para jogar de novo).
   * Se for hora, mostra um intersticial; a promessa SEMPRE resolve — com ou
   * sem anúncio — e o jogo então começa a próxima partida.
   */
  beforeNextRun(hooks: AdHooks = {}): Promise<InterstitialOutcome> {
    if (this.interstitialInFlight) return this.interstitialInFlight;
    if (!this.active || !this.config.interstitial.enabled) return Promise.resolve('disabled');
    if (!this.policy.isDue()) return Promise.resolve('not-due');
    if (!guard(() => this.provider.isReady(), false)) {
      this.log('interstitial', { result: 'unavailable', status: 'notReady' });
      return Promise.resolve('unavailable');
    }

    const p = new Promise<InterstitialOutcome>((resolve) => {
      let settled = false;
      let started = false;
      let ended = false;
      let startTimer: unknown = null;
      let maxTimer: unknown = null;
      const settle = (r: InterstitialOutcome, status: string) => {
        if (settled) return;
        settled = true;
        this.timers.clearTimeout(startTimer);
        this.timers.clearTimeout(maxTimer);
        this.interstitialInFlight = null;
        this.log('interstitial', { result: r, status });
        resolve(r);
      };
      startTimer = this.timers.setTimeout(() => {
        if (!started) settle('unavailable', 'timeout');
      }, this.config.timeouts.interstitialStartMs);

      const ok = guard(() => {
        this.provider.interstitial('restart', {
          adStarted: () => {
            if (started) return;
            started = true;
            // Impressão de verdade: só agora conta para a frequência.
            this.policy.adShown();
            this.timers.clearTimeout(startTimer);
            guard(() => hooks.onAdStart?.());
            if (!settled) {
              maxTimer = this.timers.setTimeout(() => {
                if (!ended) guard(() => hooks.onAdEnd?.());
                settle('shown', 'max-time');
              }, this.config.timeouts.adMaxMs);
            }
          },
          adEnded: () => {
            if (ended || !started) return;
            ended = true;
            guard(() => hooks.onAdEnd?.());
          },
          done: ({ shown, status }) => {
            if (started && !ended) {
              ended = true;
              guard(() => hooks.onAdEnd?.());
            }
            settle(shown || started ? 'shown' : status === 'error' ? 'error' : 'unavailable', status);
          },
        });
        return true;
      }, false);
      if (!ok) settle('error', 'exception');
    });
    this.interstitialInFlight = p;
    return p;
  }

  /**
   * Oferta de anúncio com recompensa para `key` (ex.: "corrida:revive:12").
   * Mesma chave = mesma oferta (nada de pedidos simultâneos); chave nova
   * cancela a anterior.
   */
  offerReward(key: string, hooks: AdHooks = {}): RewardedOffer {
    if (this.offer?.key === key) return this.offer;
    this.offer?.cancel();
    const offer = new RewardedOffer(key);
    this.offer = offer;

    if (!this.active || this.config.rewarded.revivesPerRun <= 0 || !guard(() => this.provider.isReady(), false)) {
      offer._end('unavailable');
      this.log('rewarded', { result: 'unavailable', status: this.active ? 'notReady' : 'disabled' });
      return offer;
    }

    let availTimer: unknown = null;
    let maxTimer: unknown = null;
    let started = false;
    let ended = false;
    const endAd = () => {
      if (started && !ended) {
        ended = true;
        guard(() => hooks.onAdEnd?.());
      }
    };
    const unsub = offer.subscribe(() => {
      if (offer.status !== 'loading') this.timers.clearTimeout(availTimer);
      if (offer.settled) {
        this.timers.clearTimeout(maxTimer);
        unsub();
        this.log('rewarded', { result: offer.status });
      }
    });
    availTimer = this.timers.setTimeout(() => offer._end('unavailable'), this.config.timeouts.rewardedAvailableMs);

    const ok = guard(() => {
      this.provider.rewarded('revive', {
        available: (show) => offer._available(show),
        adStarted: () => {
          if (started || offer.status !== 'showing') return;
          started = true;
          this.policy.rewardedShown();
          guard(() => hooks.onAdStart?.());
          maxTimer = this.timers.setTimeout(() => {
            endAd();
            offer._end('dismissed');
          }, this.config.timeouts.adMaxMs);
        },
        adEnded: endAd,
        viewed: () => offer._viewed(),
        dismissed: () => {},
        done: ({ status }) => {
          endAd();
          offer._end(status === 'error' ? 'error' : status === 'dismissed' ? 'dismissed' : 'unavailable');
        },
      });
      return true;
    }, false);
    if (!ok) offer._end('error');
    return offer;
  }
}

function guard<T>(fn: () => T, fallback?: T): T {
  try {
    return fn();
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[ads]', err);
    return fallback as T;
  }
}
