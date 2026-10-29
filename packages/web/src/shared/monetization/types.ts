/**
 * Contrato entre a camada de monetização e as redes de anúncio.
 *
 * O código de jogo nunca fala com um provedor diretamente: fala com
 * `Monetization` (monetization.ts), que aplica a política de frequência, as
 * travas contra duplicidade e os tempos-limite. O provedor só traduz para a
 * API da rede (hoje: Google Ad Placement API / H5 Games Ads).
 */

/** Como terminou uma tentativa de intersticial. */
export type InterstitialOutcome =
  /** O anúncio apareceu de fato (impressão). */
  | 'shown'
  /** A política decidiu que ainda não é hora (nada foi pedido à rede). */
  | 'not-due'
  /** Pedido feito, mas a rede não tinha anúncio (sem estoque, limite de frequência, não pronta, tempo esgotado…). */
  | 'unavailable'
  /** Anúncios desligados por configuração. */
  | 'disabled'
  /** Erro da rede ou nos callbacks — o jogo segue. */
  | 'error';

/** Como terminou um anúncio com recompensa. */
export type RewardOutcome = 'rewarded' | 'dismissed' | 'unavailable' | 'error';

/** Ganchos do jogo durante um anúncio (pausar/silenciar e voltar). */
export interface AdHooks {
  /** O anúncio vai aparecer agora: silencie o som (síncrono). */
  onAdStart?(): void;
  /** O anúncio saiu da tela (por qualquer motivo). */
  onAdEnd?(): void;
}

/** Callbacks de baixo nível de um intersticial, no vocabulário da rede. */
export interface InterstitialCallbacks {
  /** Vai mostrar o anúncio agora. */
  adStarted(): void;
  /** O anúncio saiu da tela. */
  adEnded(): void;
  /** Fim do pedido (sempre por último, mesmo sem anúncio). `shown` = houve impressão. */
  done(result: { shown: boolean; status: string }): void;
}

/** Callbacks de baixo nível de um anúncio com recompensa. */
export interface RewardedCallbacks {
  /** Há anúncio disponível; `show` o exibe (chamar só quando o jogador aceitar). */
  available(show: () => void): void;
  adStarted(): void;
  adEnded(): void;
  /** O jogador viu até o fim — só aqui a recompensa vale. */
  viewed(): void;
  /** Fechou antes do fim — sem recompensa. */
  dismissed(): void;
  /** Fim do pedido (sempre por último). */
  done(result: { status: string }): void;
}

export interface AdProvider {
  /** 'google-h5' (rede real), 'dev' (simulado, só em desenvolvimento) ou 'off'. */
  readonly id: 'google-h5' | 'dev' | 'off';
  /** Carrega o SDK (idempotente). Erros não propagam. */
  init(): void;
  /** A rede já está pronta para pedir anúncios? */
  isReady(): boolean;
  /** Informa se o jogo está com som (a rede escolhe criativos adequados). */
  setSound(on: boolean): void;
  /** Pede um intersticial. Deve chamar `done` exatamente uma vez — ou nunca, se a rede travar (a fachada tem tempo-limite). */
  interstitial(name: string, cb: InterstitialCallbacks): void;
  /** Pede um anúncio com recompensa (mesmo contrato de `done`). */
  rewarded(name: string, cb: RewardedCallbacks): void;
}
