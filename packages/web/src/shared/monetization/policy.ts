/**
 * Política de frequência dos intersticiais — pura, sem DOM e sem rede.
 *
 * Regras:
 *  - a primeira partida concluída da sessão nunca tem anúncio;
 *  - no máximo um a cada `everyRuns` partidas concluídas;
 *  - e só depois de `minIntervalMs` desde o último anúncio (ou desde o
 *    início da sessão, para o primeiro);
 *  - só conta como exibido o anúncio que apareceu de fato (`adShown`), não
 *    o que foi apenas pedido. Se a rede não tinha anúncio, a próxima partida
 *    concluída continua elegível.
 *
 * O estado fica no sessionStorage: recarregar a página não zera a contagem
 * (nem permite um anúncio logo após recarregar).
 */
export interface PolicyRules {
  everyRuns: number;
  minIntervalMs: number;
}

export interface PolicyState {
  /** Partidas concluídas na sessão. */
  runsCompleted: number;
  /** Partidas concluídas desde o último intersticial exibido. */
  runsSinceAd: number;
  /** Referência do intervalo: último anúncio exibido ou início da sessão (ms). */
  lastAdAt: number;
  /** Intersticiais exibidos na sessão (métrica). */
  shown: number;
}

export interface PolicyStore {
  load(): PolicyState | null;
  save(s: PolicyState): void;
}

export class InterstitialPolicy {
  private s: PolicyState;

  constructor(
    private rules: PolicyRules,
    private readonly now: () => number,
    private readonly store?: PolicyStore,
  ) {
    const saved = safe(() => store?.load() ?? null, null);
    this.s = isState(saved) ? saved : { runsCompleted: 0, runsSinceAd: 0, lastAdAt: now(), shown: 0 };
  }

  get state(): Readonly<PolicyState> {
    return this.s;
  }

  setRules(rules: PolicyRules): void {
    this.rules = rules;
  }

  /** Uma partida chegou ao fim (chamar uma vez por partida). */
  runCompleted(): void {
    this.s = { ...this.s, runsCompleted: this.s.runsCompleted + 1, runsSinceAd: this.s.runsSinceAd + 1 };
    this.persist();
  }

  /** Já é hora de pedir um intersticial nesta transição? */
  isDue(): boolean {
    const { runsCompleted, runsSinceAd, lastAdAt } = this.s;
    if (runsCompleted < 2) return false;
    if (runsSinceAd < this.rules.everyRuns) return false;
    return this.now() - lastAdAt >= this.rules.minIntervalMs;
  }

  /** Um intersticial apareceu de fato na tela. */
  adShown(): void {
    this.s = { ...this.s, runsSinceAd: 0, lastAdAt: this.now(), shown: this.s.shown + 1 };
    this.persist();
  }

  /**
   * Um anúncio com recompensa foi exibido: reinicia só o relógio, para não
   * emendar um intersticial logo depois de o jogador ter escolhido ver um.
   */
  rewardedShown(): void {
    this.s = { ...this.s, lastAdAt: this.now() };
    this.persist();
  }

  private persist(): void {
    safe(() => this.store?.save(this.s), undefined);
  }
}

function isState(v: unknown): v is PolicyState {
  const o = v as PolicyState | null;
  return (
    !!o &&
    [o.runsCompleted, o.runsSinceAd, o.lastAdAt, o.shown].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
  );
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** sessionStorage com tolerância a falhas (aba anônima, cookies bloqueados…). */
export function sessionPolicyStore(key: string): PolicyStore {
  return {
    load() {
      const raw = globalThis.sessionStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as PolicyState) : null;
    },
    save(s) {
      globalThis.sessionStorage?.setItem(key, JSON.stringify(s));
    },
  };
}
