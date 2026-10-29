import { describe, expect, it } from 'vitest';
import { ADSBYGOOGLE_SRC, GoogleH5Provider, type AdBreakParams, type AdConfigParams } from '../providers/googleH5';

/** Mock isolado da Ad Placement API: só registra o que seria empurrado para `adsbygoogle`. */
function provider(testMode = false) {
  const queue: Array<AdBreakParams | AdConfigParams> = [];
  const scripts: Record<string, string>[] = [];
  const p = new GoogleH5Provider({
    adClient: 'ca-pub-1234567890123456',
    testMode,
    frequencyHintS: 120,
    namePrefix: 'corrida',
    push: (o) => queue.push(o),
    loadScript: (a) => scripts.push(a),
  });
  return { p, queue, scripts };
}

describe('provedor Google H5 (Ad Placement API)', () => {
  it('carrega o adsbygoogle.js uma vez, com publisher, dica de frequência e preload', () => {
    const { p, queue, scripts } = provider();
    p.init();
    p.init();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(`${ADSBYGOOGLE_SRC}?client=ca-pub-1234567890123456`);
    expect(scripts[0]['data-ad-frequency-hint']).toBe('120s');
    expect(scripts[0]['data-adbreak-test']).toBeUndefined();
    const cfg = queue[0] as AdConfigParams;
    expect(cfg.preloadAdBreaks).toBe('on');
    expect(typeof cfg.onReady).toBe('function');
  });

  it('modo de teste oficial liga data-adbreak-test', () => {
    const { p, scripts } = provider(true);
    p.init();
    expect(scripts[0]['data-adbreak-test']).toBe('on');
  });

  it('só fica pronto depois do onReady', () => {
    const { p, queue } = provider();
    expect(p.isReady()).toBe(false);
    p.init();
    expect(p.isReady()).toBe(false);
    (queue[0] as AdConfigParams).onReady!();
    expect(p.isReady()).toBe(true);
  });

  it('som: informa a rede só quando muda', () => {
    const { p, queue } = provider();
    p.init();
    p.setSound(true);
    expect(queue).toHaveLength(1);
    p.setSound(false);
    expect(queue[1]).toEqual({ sound: 'off' });
  });

  it('intersticial usa o tipo "start" (reinício) e traduz os callbacks', () => {
    const { p, queue } = provider();
    const log: string[] = [];
    p.interstitial('restart', {
      adStarted: () => log.push('started'),
      adEnded: () => log.push('ended'),
      done: (r) => log.push(`done:${r.shown}:${r.status}`),
    });
    const b = queue[0] as AdBreakParams;
    expect(b.type).toBe('start');
    expect(b.name).toBe('corrida-restart');
    b.beforeAd!();
    b.afterAd!();
    b.adBreakDone!({ breakStatus: 'viewed' });
    expect(log).toEqual(['started', 'ended', 'done:true:viewed']);
  });

  it('intersticial sem anúncio: done sem impressão', () => {
    const { p, queue } = provider();
    let res: { shown: boolean; status: string } | null = null;
    p.interstitial('restart', { adStarted: () => {}, adEnded: () => {}, done: (r) => (res = r) });
    (queue[0] as AdBreakParams).adBreakDone!({ breakStatus: 'frequencyCapped' });
    expect(res).toEqual({ shown: false, status: 'frequencyCapped' });
  });

  it('recompensado: beforeReward entrega showAdFn; viewed e dismissed separados', () => {
    const { p, queue } = provider();
    const log: string[] = [];
    let show: (() => void) | null = null;
    p.rewarded('revive', {
      available: (fn) => {
        show = fn;
        log.push('available');
      },
      adStarted: () => log.push('started'),
      adEnded: () => log.push('ended'),
      viewed: () => log.push('viewed'),
      dismissed: () => log.push('dismissed'),
      done: (r) => log.push(`done:${r.status}`),
    });
    const b = queue[0] as AdBreakParams;
    expect(b.type).toBe('reward');
    expect(b.name).toBe('corrida-revive');
    let showCalls = 0;
    b.beforeReward!(() => showCalls++);
    show!();
    expect(showCalls).toBe(1);
    b.beforeAd!();
    b.adDismissed!();
    b.afterAd!();
    b.adBreakDone!({ breakStatus: 'dismissed' });
    expect(log).toEqual(['available', 'started', 'dismissed', 'ended', 'done:dismissed']);
  });
});
