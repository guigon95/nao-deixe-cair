/**
 * Anúncio com recompensa ("assista e ganhe"). Hoje não há rede de anúncios:
 * `NoAds` libera a recompensa na hora. Para ligar anúncios depois, crie uma
 * implementação (AdSense para jogos/H5 Games Ads, AdinPlay, etc.) e troque
 * `rewardedAds` — as telas só falam com esta interface.
 */
export type RewardResult = 'rewarded' | 'dismissed' | 'unavailable';

export interface RewardedAds {
  /** 'none' enquanto não houver anúncios de verdade. */
  readonly provider: string;
  /** Mostra um anúncio e diz se o jogador ganhou a recompensa. */
  show(placement: 'continue'): Promise<RewardResult>;
}

export class NoAds implements RewardedAds {
  readonly provider = 'none';
  async show(): Promise<RewardResult> {
    return 'rewarded';
  }
}

export const rewardedAds: RewardedAds = new NoAds();
