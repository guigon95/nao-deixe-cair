import { resolveConfig, type MonetizationConfig } from '../config';
import { Monetization, type Timers } from '../monetization';
import type { AdProvider, InterstitialCallbacks, RewardedCallbacks } from '../types';

/** Relógio e temporizadores manuais (nada de tempo real nos testes). */
export class FakeClock implements Timers {
  now = 1_000_000;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.timers.set(id, { at: this.now + ms, fn });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.timers.delete(id as number);
  };
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].fn();
    }
    this.now = end;
  }
  get pending() {
    return this.timers.size;
  }
}

/** Provedor falso: guarda os pedidos para o teste disparar os callbacks da "rede". */
export class MockProvider implements AdProvider {
  readonly id = 'google-h5' as const;
  ready = true;
  inits = 0;
  sound: boolean | null = null;
  interstitials: InterstitialCallbacks[] = [];
  rewardeds: RewardedCallbacks[] = [];
  throwOnRequest = false;
  init() {
    this.inits++;
  }
  isReady() {
    return this.ready;
  }
  setSound(on: boolean) {
    this.sound = on;
  }
  interstitial(_name: string, cb: InterstitialCallbacks) {
    if (this.throwOnRequest) throw new Error('rede caiu');
    this.interstitials.push(cb);
  }
  rewarded(_name: string, cb: RewardedCallbacks) {
    if (this.throwOnRequest) throw new Error('rede caiu');
    this.rewardeds.push(cb);
  }
  get lastInterstitial() {
    return this.interstitials[this.interstitials.length - 1];
  }
  get lastRewarded() {
    return this.rewardeds[this.rewardeds.length - 1];
  }
}

export function testConfig(env: Record<string, string> = {}): MonetizationConfig {
  return resolveConfig({ VITE_ADS_PROVIDER: 'google', VITE_ADSENSE_CLIENT: 'ca-pub-1234567890123456', ...env }, { dev: false });
}

export function setup(env: Record<string, string> = {}) {
  const clock = new FakeClock();
  const provider = new MockProvider();
  const m = new Monetization({ config: testConfig(env), provider, now: () => clock.now, timers: clock });
  return { clock, provider, m };
}

/** Conclui `n` partidas com chaves novas. */
export function completeRuns(m: Monetization, n: number, from = 1) {
  for (let i = from; i < from + n; i++) m.runCompleted(`run:${i}`);
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
