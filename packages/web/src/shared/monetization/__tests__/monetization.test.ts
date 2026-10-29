import { describe, expect, it } from 'vitest';
import { Monetization } from '../monetization';
import { OffProvider } from '../providers/off';
import { completeRuns, FakeClock, flush, setup, testConfig } from './helpers';

const MIN = 120_000;

/** Monetização já com intersticial devido (3 partidas e intervalo cumprido). */
function due(env: Record<string, string> = {}) {
  const s = setup(env);
  s.clock.advance(MIN);
  completeRuns(s.m, 3);
  return s;
}

describe('intersticial entre partidas', () => {
  it('primeira derrota: nada é pedido à rede', async () => {
    const { m, provider, clock } = setup();
    clock.advance(10 * MIN);
    m.runCompleted('run:1');
    expect(await m.beforeNextRun()).toBe('not-due');
    expect(provider.interstitials).toHaveLength(0);
  });

  it('a cada 3 partidas, só conta a impressão quando o anúncio aparece', async () => {
    const { m, provider } = due();
    const events: string[] = [];
    const p = m.beforeNextRun({ onAdStart: () => events.push('start'), onAdEnd: () => events.push('end') });
    expect(provider.interstitials).toHaveLength(1);
    expect(m.policy.state.shown).toBe(0); // pedido ≠ impressão
    provider.lastInterstitial.adStarted();
    expect(m.policy.state.shown).toBe(1);
    provider.lastInterstitial.adEnded();
    provider.lastInterstitial.done({ shown: true, status: 'viewed' });
    expect(await p).toBe('shown');
    expect(events).toEqual(['start', 'end']);
    // Logo depois: não é hora (contagem zerada e intervalo).
    m.runCompleted('run:4');
    expect(await m.beforeNextRun()).toBe('not-due');
  });

  it('sem anúncio disponível: segue na hora e não conta impressão', async () => {
    const { m, provider } = due();
    const p = m.beforeNextRun();
    provider.lastInterstitial.done({ shown: false, status: 'noAdPreloaded' });
    expect(await p).toBe('unavailable');
    expect(m.policy.state.shown).toBe(0);
    // Continua elegível na próxima transição.
    m.runCompleted('run:4');
    m.beforeNextRun();
    expect(provider.interstitials).toHaveLength(2);
  });

  it('cliques repetidos / reinício não duplicam o anúncio', async () => {
    const { m, provider } = due();
    const a = m.beforeNextRun();
    const b = m.beforeNextRun();
    const c = m.beforeNextRun();
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(provider.interstitials).toHaveLength(1);
    provider.lastInterstitial.adStarted();
    provider.lastInterstitial.adStarted(); // callback repetido
    provider.lastInterstitial.done({ shown: true, status: 'viewed' });
    provider.lastInterstitial.done({ shown: true, status: 'viewed' });
    expect(await a).toBe('shown');
    expect(m.policy.state.shown).toBe(1);
  });

  it('mesma partida concluída duas vezes (re-render) conta uma vez', () => {
    const { m } = setup();
    m.runCompleted('run:7');
    m.runCompleted('run:7');
    m.runCompleted('run:7');
    expect(m.policy.state.runsCompleted).toBe(1);
  });

  it('rede que não responde: o jogo segue após o tempo-limite', async () => {
    const { m, clock } = due();
    let result: string | null = null;
    void m.beforeNextRun().then((r) => (result = r));
    clock.advance(2999);
    await flush();
    expect(result).toBeNull();
    clock.advance(1);
    await flush();
    expect(result).toBe('unavailable');
    expect(clock.pending).toBe(0);
  });

  it('rede não pronta (script bloqueado): nem pede, para não aparecer depois no meio da partida', async () => {
    const { m, provider } = due();
    provider.ready = false;
    expect(await m.beforeNextRun()).toBe('unavailable');
    expect(provider.interstitials).toHaveLength(0);
  });

  it('erro da rede ou do jogo nunca trava a próxima partida', async () => {
    const s1 = due();
    s1.provider.throwOnRequest = true;
    expect(await s1.m.beforeNextRun()).toBe('error');

    const s2 = due();
    const p = s2.m.beforeNextRun({
      onAdStart: () => {
        throw new Error('bug no jogo');
      },
    });
    s2.provider.lastInterstitial.adStarted();
    s2.provider.lastInterstitial.done({ shown: true, status: 'viewed' });
    expect(await p).toBe('shown');
  });

  it('anúncio que nunca fecha: teto absoluto libera o jogo', async () => {
    const { m, provider, clock } = due();
    const ended: string[] = [];
    let result: string | null = null;
    void m.beforeNextRun({ onAdEnd: () => ended.push('end') }).then((r) => (result = r));
    provider.lastInterstitial.adStarted();
    clock.advance(120_000);
    await flush();
    expect(result).toBe('shown');
    expect(ended).toEqual(['end']);
  });

  it('desligado por configuração ou sem provedor: nunca mostra nada', async () => {
    const clock = new FakeClock();
    const off = new Monetization({ config: testConfig(), provider: new OffProvider(), now: () => clock.now, timers: clock });
    completeRuns(off, 10);
    clock.advance(10 * MIN);
    expect(await off.beforeNextRun()).toBe('disabled');
    expect(off.revivesPerRun).toBe(0);
    expect(off.offerReward('x').status).toBe('unavailable');

    const { m, provider } = due({ VITE_ADS_INTERSTITIAL: 'off' });
    expect(await m.beforeNextRun()).toBe('disabled');
    expect(provider.interstitials).toHaveLength(0);
  });
});

describe('anúncio com recompensa (reviver)', () => {
  it('recompensa só depois da confirmação (adViewed) e só uma vez', async () => {
    const { m, provider } = setup();
    const offer = m.offerReward('revive:1');
    expect(offer.status).toBe('loading');
    expect(offer.claim()).toBe(false);
    let shown = 0;
    provider.lastRewarded.available(() => shown++);
    expect(offer.status).toBe('ready');
    expect(offer.claim()).toBe(false); // disponível ≠ recompensa
    const p = offer.show();
    expect(shown).toBe(1);
    expect(offer.status).toBe('showing');
    provider.lastRewarded.adStarted();
    expect(offer.claim()).toBe(false); // começou ≠ recompensa
    provider.lastRewarded.viewed();
    provider.lastRewarded.adEnded();
    provider.lastRewarded.done({ status: 'viewed' });
    expect(await p).toBe('rewarded');
    expect(offer.claim()).toBe(true);
    expect(offer.claim()).toBe(false); // nada de recompensa duplicada
  });

  it('fechou antes do fim: sem recompensa', async () => {
    const { m, provider } = setup();
    const offer = m.offerReward('revive:1');
    provider.lastRewarded.available(() => {});
    const p = offer.show();
    provider.lastRewarded.adStarted();
    provider.lastRewarded.dismissed();
    provider.lastRewarded.adEnded();
    provider.lastRewarded.done({ status: 'dismissed' });
    expect(await p).toBe('dismissed');
    expect(offer.claim()).toBe(false);
    // Callbacks atrasados não viram recompensa.
    provider.lastRewarded.viewed();
    provider.lastRewarded.done({ status: 'viewed' });
    expect(offer.status).toBe('dismissed');
    expect(offer.claim()).toBe(false);
  });

  it('status "viewed" da rede sem o callback adViewed não basta', async () => {
    const { m, provider } = setup();
    const offer = m.offerReward('revive:1');
    provider.lastRewarded.available(() => {});
    const p = offer.show();
    provider.lastRewarded.adStarted();
    provider.lastRewarded.done({ status: 'viewed' });
    expect(await p).toBe('dismissed');
    expect(offer.claim()).toBe(false);
  });

  it('sem anúncio: oferta indisponível (o jogo mantém "jogar novamente")', async () => {
    const { m, provider } = setup();
    const offer = m.offerReward('revive:1');
    provider.lastRewarded.done({ status: 'noAdPreloaded' });
    expect(offer.status).toBe('unavailable');
    expect(await offer.show()).toBe('unavailable');
  });

  it('rede muda: tempo-limite marca indisponível; resposta atrasada é ignorada', () => {
    const { m, provider, clock } = setup();
    const offer = m.offerReward('revive:1');
    clock.advance(8000);
    expect(offer.status).toBe('unavailable');
    let called = 0;
    provider.lastRewarded.available(() => called++);
    expect(offer.status).toBe('unavailable');
    void offer.show();
    expect(called).toBe(0);
  });

  it('nada de pedidos simultâneos: mesma chave = mesma oferta; cliques repetidos = um anúncio', async () => {
    const { m, provider } = setup();
    const a = m.offerReward('revive:1');
    const b = m.offerReward('revive:1');
    expect(a).toBe(b);
    expect(provider.rewardeds).toHaveLength(1);
    let shows = 0;
    provider.lastRewarded.available(() => shows++);
    const p1 = a.show();
    const p2 = a.show();
    expect(shows).toBe(1);
    provider.lastRewarded.adStarted();
    provider.lastRewarded.viewed();
    provider.lastRewarded.done({ status: 'viewed' });
    expect(await p1).toBe('rewarded');
    expect(await p2).toBe('rewarded');
    expect([a.claim(), b.claim()].filter(Boolean)).toHaveLength(1);
  });

  it('nova partida cancela a oferta antiga sem conceder nada', () => {
    const { m, provider } = setup();
    const old = m.offerReward('revive:1');
    const cbOld = provider.lastRewarded;
    m.offerReward('revive:2');
    expect(old.status).toBe('cancelled');
    let shown = 0;
    cbOld.available(() => shown++);
    void old.show();
    expect(shown).toBe(0);
    expect(old.claim()).toBe(false);
  });

  it('recompensa vista reinicia o relógio do intersticial', () => {
    const { m, provider, clock } = setup();
    clock.advance(MIN);
    completeRuns(m, 3);
    expect(m.policy.isDue()).toBe(true);
    const offer = m.offerReward('revive:3');
    provider.lastRewarded.available(() => {});
    void offer.show();
    provider.lastRewarded.adStarted();
    expect(m.policy.isDue()).toBe(false);
  });

  it('erro ao pedir ou ao exibir não trava e não recompensa', async () => {
    const s1 = setup();
    s1.provider.throwOnRequest = true;
    expect(s1.m.offerReward('revive:1').status).toBe('error');

    const s2 = setup();
    const offer = s2.m.offerReward('revive:1');
    s2.provider.lastRewarded.available(() => {
      throw new Error('showAdFn falhou');
    });
    expect(await offer.show()).toBe('error');
    expect(offer.claim()).toBe(false);
  });

  it('revive desligado por configuração', () => {
    const { m, provider } = setup({ VITE_ADS_REWARDED_REVIVES: '0' });
    expect(m.revivesPerRun).toBe(0);
    expect(m.offerReward('revive:1').status).toBe('unavailable');
    expect(provider.rewardeds).toHaveLength(0);
  });
});
