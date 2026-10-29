import { resolveConfig, type MonetizationConfig } from './config';
import { Monetization } from './monetization';
import { sessionPolicyStore } from './policy';
import { DevSimulatedProvider } from './providers/devSimulated';
import { GoogleH5Provider } from './providers/googleH5';
import { OffProvider } from './providers/off';
import type { AdProvider } from './types';

export { Monetization, RewardedOffer, type OfferStatus } from './monetization';
export type { InterstitialOutcome, RewardOutcome, AdHooks } from './types';

/**
 * Instância por jogo (cada jogo tem sua própria contagem de partidas).
 * Hoje só a Disparada usa; Bolinha e Acrobata não importam este módulo.
 */
const instances = new Map<string, Monetization>();

export function getMonetization(game: string): Monetization {
  let m = instances.get(game);
  if (!m) {
    const config = resolveConfig(import.meta.env as unknown as Record<string, string>, {
      dev: import.meta.env.DEV,
      search: typeof location !== 'undefined' ? location.search : '',
      warn: (msg) => console.warn(msg),
    });
    m = new Monetization({
      config,
      provider: createProvider(config, game),
      store: sessionPolicyStore(`ndc:${game}:ads`),
      log: import.meta.env.DEV ? (event, data) => console.info(`[ads] ${event}`, data) : undefined,
    });
    instances.set(game, m);
  }
  return m;
}

function createProvider(config: MonetizationConfig, game: string): AdProvider {
  if (config.provider === 'google' && config.adClient) {
    return new GoogleH5Provider({
      adClient: config.adClient,
      testMode: config.testMode,
      frequencyHintS: config.interstitial.minIntervalMs / 1000,
      namePrefix: game,
    });
  }
  // `import.meta.env.DEV` é constante no build: em produção este ramo some.
  if (import.meta.env.DEV && config.provider === 'dev') return new DevSimulatedProvider();
  return new OffProvider();
}
