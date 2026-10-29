import type { AdProvider, InterstitialCallbacks, RewardedCallbacks } from '../types';

/**
 * Google H5 Games Ads via Ad Placement API (`adBreak` / `adConfig`).
 * Documentação: https://developers.google.com/ad-placement
 *
 * O SDK é o `adsbygoogle.js` do AdSense; `adBreak()` e `adConfig()` apenas
 * empurram objetos para a fila `window.adsbygoogle`, como no trecho oficial:
 *
 *   window.adsbygoogle = window.adsbygoogle || [];
 *   var adBreak = adConfig = function(o) {adsbygoogle.push(o);}
 *
 * Só pedimos anúncios depois do `onReady` do `adConfig`: se o script for
 * bloqueado (bloqueador de anúncios, rede ruim), nada fica enfileirado para
 * aparecer mais tarde no meio de uma partida.
 */

/** Campos do `placementInfo` recebido em `adBreakDone`. */
export interface PlacementInfo {
  breakType?: string;
  breakName?: string;
  breakFormat?: 'interstitial' | 'reward' | string;
  /** notReady | timeout | invalid | error | noAdPreloaded | frequencyCapped | ignored | other | dismissed | viewed */
  breakStatus?: string;
}

export interface AdBreakParams {
  type: 'preroll' | 'start' | 'pause' | 'next' | 'browse' | 'reward';
  name?: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: PlacementInfo) => void;
}

export interface AdConfigParams {
  sound?: 'on' | 'off';
  preloadAdBreaks?: 'on' | 'auto';
  onReady?: () => void;
}

export interface GoogleH5Options {
  /** Publisher ID do AdSense (ca-pub-…). */
  adClient: string;
  /** `data-adbreak-test="on"`: anúncios de exemplo do Google, sem pedido real. */
  testMode: boolean;
  /** `data-ad-frequency-hint` em segundos (o Google aplica o próprio limite também). */
  frequencyHintS: number;
  /** Prefixo dos nomes dos posicionamentos (aparecem nos relatórios do AdSense). */
  namePrefix: string;
  /** Injeções para testes: fila e carregador do script. */
  push?: (o: AdBreakParams | AdConfigParams) => void;
  loadScript?: (attrs: Record<string, string>) => void;
}

export const ADSBYGOOGLE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

export class GoogleH5Provider implements AdProvider {
  readonly id = 'google-h5' as const;
  private ready = false;
  private loaded = false;
  private sound: 'on' | 'off' = 'on';
  private readonly push: (o: AdBreakParams | AdConfigParams) => void;
  private readonly loadScript: (attrs: Record<string, string>) => void;

  constructor(private readonly opts: GoogleH5Options) {
    this.push = opts.push ?? browserPush;
    this.loadScript = opts.loadScript ?? browserLoadScript;
  }

  init(): void {
    if (this.loaded) return;
    this.loaded = true;
    const attrs: Record<string, string> = {
      src: `${ADSBYGOOGLE_SRC}?client=${encodeURIComponent(this.opts.adClient)}`,
      'data-ad-frequency-hint': `${Math.round(this.opts.frequencyHintS)}s`,
    };
    if (this.opts.testMode) attrs['data-adbreak-test'] = 'on';
    this.loadScript(attrs);
    // Preload ligado: o primeiro posicionamento não é preroll, então pedimos a pré-carga explicitamente.
    this.push({
      sound: this.sound,
      preloadAdBreaks: 'on',
      onReady: () => {
        this.ready = true;
      },
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  setSound(on: boolean): void {
    const next = on ? 'on' : 'off';
    if (next === this.sound) return;
    this.sound = next;
    if (this.loaded) this.push({ sound: next });
  }

  interstitial(name: string, cb: InterstitialCallbacks): void {
    let shown = false;
    this.push({
      // 'start': depois que a interface está visível e antes do jogo começar — inclui reiniciar.
      type: 'start',
      name: `${this.opts.namePrefix}-${name}`,
      beforeAd: () => {
        shown = true;
        cb.adStarted();
      },
      afterAd: () => cb.adEnded(),
      adBreakDone: (info) => cb.done({ shown: shown || info?.breakStatus === 'viewed', status: info?.breakStatus ?? 'other' }),
    });
  }

  rewarded(name: string, cb: RewardedCallbacks): void {
    this.push({
      type: 'reward',
      name: `${this.opts.namePrefix}-${name}`,
      beforeReward: (showAdFn) => cb.available(showAdFn),
      beforeAd: () => cb.adStarted(),
      afterAd: () => cb.adEnded(),
      adViewed: () => cb.viewed(),
      adDismissed: () => cb.dismissed(),
      adBreakDone: (info) => cb.done({ status: info?.breakStatus ?? 'other' }),
    });
  }
}

type AdsWindow = { adsbygoogle?: Array<unknown> };

function browserPush(o: AdBreakParams | AdConfigParams): void {
  const w = window as unknown as AdsWindow;
  w.adsbygoogle = w.adsbygoogle || [];
  w.adsbygoogle.push(o);
}

function browserLoadScript(attrs: Record<string, string>): void {
  if (document.querySelector(`script[src^="${ADSBYGOOGLE_SRC}"]`)) return;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.head.appendChild(s);
}
