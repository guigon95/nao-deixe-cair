import type { AdProvider, InterstitialCallbacks, RewardedCallbacks } from '../types';

/** Anúncios desligados: nunca há anúncio e NUNCA há recompensa. */
export class OffProvider implements AdProvider {
  readonly id = 'off' as const;
  init(): void {}
  isReady(): boolean {
    return false;
  }
  setSound(): void {}
  interstitial(_name: string, cb: InterstitialCallbacks): void {
    cb.done({ shown: false, status: 'disabled' });
  }
  rewarded(_name: string, cb: RewardedCallbacks): void {
    cb.done({ status: 'disabled' });
  }
}
