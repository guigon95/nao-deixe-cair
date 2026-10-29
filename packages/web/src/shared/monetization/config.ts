/**
 * Configuração da monetização. Tudo vem de variáveis de ambiente do Vite
 * (definidas no painel da Vercel ou em `packages/web/.env.local`), com padrões
 * seguros: sem configuração, NÃO há anúncios e o jogo funciona como sempre.
 *
 *   VITE_ADS_PROVIDER                    off | google | dev      (padrão: off)
 *   VITE_ADSENSE_CLIENT                  ca-pub-XXXXXXXXXXXXXXXX (obrigatório para google)
 *   VITE_ADS_TEST_MODE                   on | off                (padrão: off) — data-adbreak-test do Google
 *   VITE_ADS_INTERSTITIAL                on | off                (padrão: on)
 *   VITE_ADS_INTERSTITIAL_EVERY_RUNS     partidas concluídas entre intersticiais (padrão: 3; mín. 2)
 *   VITE_ADS_INTERSTITIAL_MIN_INTERVAL_S intervalo mínimo entre intersticiais em s (padrão: 120; 30–900)
 *   VITE_ADS_REWARDED_REVIVES            revives por anúncio por partida (padrão: 1; 0 desliga)
 *
 * `dev` (anúncio simulado com aviso na tela) só existe em `npm run dev`; num
 * build de produção ele vira `off`. Em desenvolvimento, `?ads=dev|google|off`
 * na URL sobrepõe o provedor.
 */
export type ProviderKind = 'off' | 'google' | 'dev';

export interface MonetizationConfig {
  provider: ProviderKind;
  /** Publisher ID do AdSense (ca-pub-…), só para `google`. */
  adClient: string | null;
  /** Modo de teste oficial do Google (anúncios de exemplo, sem pedido real). */
  testMode: boolean;
  interstitial: {
    enabled: boolean;
    /** Um intersticial a cada N partidas concluídas (a 1ª derrota nunca tem anúncio). */
    everyRuns: number;
    /** Intervalo mínimo entre intersticiais (ms), contado também desde o início da sessão. */
    minIntervalMs: number;
  };
  rewarded: {
    /** Revives por anúncio por partida (0 = sem revive). */
    revivesPerRun: number;
  };
  /** Tempos-limite de segurança: a publicidade nunca trava o jogo. */
  timeouts: {
    /** Esperando o intersticial começar; depois disso o jogo segue sem ele. */
    interstitialStartMs: number;
    /** Esperando a rede dizer se há anúncio com recompensa. */
    rewardedAvailableMs: number;
    /** Teto absoluto para um anúncio já na tela terminar. */
    adMaxMs: number;
  };
}

export const DEFAULTS = {
  everyRuns: 3,
  minIntervalS: 120,
  revivesPerRun: 1,
} as const;

const AD_CLIENT_RE = /^ca-pub-\d{10,20}$/;

type Env = Record<string, string | boolean | undefined>;

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function flag(v: unknown, fallback: boolean): boolean {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().toLowerCase();
  if (['on', 'true', '1', 'yes', 'sim'].includes(s)) return true;
  if (['off', 'false', '0', 'no', 'nao', 'não'].includes(s)) return false;
  return fallback;
}

export interface ResolveOptions {
  /** `import.meta.env.DEV`. */
  dev: boolean;
  /** Query string da página (só usada em desenvolvimento). */
  search?: string;
  warn?: (msg: string) => void;
}

/** Monta a configuração a partir das variáveis de ambiente (função pura: testável). */
export function resolveConfig(env: Env, opts: ResolveOptions): MonetizationConfig {
  const warn = opts.warn ?? (() => {});
  let provider = String(env.VITE_ADS_PROVIDER ?? 'off').trim().toLowerCase() as ProviderKind;
  if (opts.dev && opts.search) {
    const q = new URLSearchParams(opts.search).get('ads');
    if (q === 'off' || q === 'google' || q === 'dev') provider = q;
  }
  if (provider !== 'google' && provider !== 'dev') provider = 'off';
  if (provider === 'dev' && !opts.dev) {
    warn('[ads] provedor "dev" ignorado fora do modo de desenvolvimento.');
    provider = 'off';
  }

  const rawClient = typeof env.VITE_ADSENSE_CLIENT === 'string' ? env.VITE_ADSENSE_CLIENT.trim() : '';
  const adClient = AD_CLIENT_RE.test(rawClient) ? rawClient : null;
  if (provider === 'google' && !adClient) {
    warn('[ads] VITE_ADSENSE_CLIENT ausente ou inválido (esperado ca-pub-…): anúncios desligados.');
    provider = 'off';
  }

  return {
    provider,
    adClient,
    testMode: flag(env.VITE_ADS_TEST_MODE, false),
    interstitial: {
      enabled: flag(env.VITE_ADS_INTERSTITIAL, true),
      // Mínimo 2: a primeira derrota da sessão nunca tem anúncio.
      everyRuns: int(env.VITE_ADS_INTERSTITIAL_EVERY_RUNS, DEFAULTS.everyRuns, 2, 50),
      minIntervalMs: int(env.VITE_ADS_INTERSTITIAL_MIN_INTERVAL_S, DEFAULTS.minIntervalS, 30, 900) * 1000,
    },
    rewarded: {
      revivesPerRun: int(env.VITE_ADS_REWARDED_REVIVES, DEFAULTS.revivesPerRun, 0, 3),
    },
    timeouts: {
      interstitialStartMs: 3000,
      rewardedAvailableMs: 8000,
      adMaxMs: 120_000,
    },
  };
}
