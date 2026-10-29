import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../config';
import { InterstitialPolicy, type PolicyState } from '../policy';

const MIN = 120_000;

function policy(everyRuns = 3, minIntervalMs = MIN) {
  let now = 0;
  const p = new InterstitialPolicy({ everyRuns, minIntervalMs }, () => now);
  return { p, tick: (ms: number) => (now += ms) };
}

describe('política de frequência dos intersticiais', () => {
  it('primeira derrota da sessão nunca tem anúncio, mesmo com regras mínimas', () => {
    const { p, tick } = policy(1, 0);
    tick(10 * MIN);
    p.runCompleted();
    expect(p.isDue()).toBe(false);
    p.runCompleted();
    expect(p.isDue()).toBe(true);
  });

  it('um a cada 3 partidas concluídas, respeitando o intervalo mínimo', () => {
    const { p, tick } = policy(3);
    tick(MIN);
    p.runCompleted();
    p.runCompleted();
    expect(p.isDue()).toBe(false);
    p.runCompleted();
    expect(p.isDue()).toBe(true);
    p.adShown();
    // Mais 3 partidas rápidas: ainda dentro do intervalo → não.
    for (let i = 0; i < 3; i++) p.runCompleted();
    tick(MIN - 1);
    expect(p.isDue()).toBe(false);
    tick(1);
    expect(p.isDue()).toBe(true);
  });

  it('o intervalo do primeiro anúncio conta desde o início da sessão', () => {
    const { p, tick } = policy(3);
    for (let i = 0; i < 5; i++) p.runCompleted();
    tick(MIN / 2);
    expect(p.isDue()).toBe(false);
    tick(MIN / 2);
    expect(p.isDue()).toBe(true);
  });

  it('pedido sem impressão não zera a contagem: a próxima partida segue elegível', () => {
    const { p, tick } = policy(3);
    tick(MIN);
    for (let i = 0; i < 3; i++) p.runCompleted();
    expect(p.isDue()).toBe(true);
    // (a rede não tinha anúncio: nada de adShown)
    p.runCompleted();
    expect(p.isDue()).toBe(true);
    expect(p.state.shown).toBe(0);
  });

  it('anúncio com recompensa reinicia só o relógio', () => {
    const { p, tick } = policy(3);
    tick(MIN);
    for (let i = 0; i < 3; i++) p.runCompleted();
    p.rewardedShown();
    expect(p.isDue()).toBe(false);
    tick(MIN);
    expect(p.isDue()).toBe(true);
  });

  it('estado persiste (recarregar a página não libera anúncio) e tolera armazenamento quebrado', () => {
    let saved: PolicyState | null = null;
    let now = 0;
    const store = { load: () => saved, save: (s: PolicyState) => (saved = s) };
    const a = new InterstitialPolicy({ everyRuns: 3, minIntervalMs: MIN }, () => now, store);
    now = MIN;
    for (let i = 0; i < 3; i++) a.runCompleted();
    a.adShown();
    const b = new InterstitialPolicy({ everyRuns: 3, minIntervalMs: MIN }, () => now, store);
    expect(b.state.shown).toBe(1);
    for (let i = 0; i < 3; i++) b.runCompleted();
    expect(b.isDue()).toBe(false);

    const broken = {
      load: () => {
        throw new Error('bloqueado');
      },
      save: () => {
        throw new Error('bloqueado');
      },
    };
    const c = new InterstitialPolicy({ everyRuns: 3, minIntervalMs: MIN }, () => now, broken);
    expect(() => c.runCompleted()).not.toThrow();
    expect(c.state.runsCompleted).toBe(1);
  });
});

describe('configuração', () => {
  it('sem variáveis: anúncios desligados', () => {
    const c = resolveConfig({}, { dev: false });
    expect(c.provider).toBe('off');
    expect(c.interstitial.everyRuns).toBe(3);
    expect(c.interstitial.minIntervalMs).toBe(120_000);
    expect(c.rewarded.revivesPerRun).toBe(1);
  });

  it('google exige um publisher ID válido', () => {
    const warns: string[] = [];
    const bad = resolveConfig({ VITE_ADS_PROVIDER: 'google', VITE_ADSENSE_CLIENT: 'pub-123' }, { dev: false, warn: (m) => warns.push(m) });
    expect(bad.provider).toBe('off');
    expect(warns).toHaveLength(1);
    const ok = resolveConfig({ VITE_ADS_PROVIDER: 'google', VITE_ADSENSE_CLIENT: 'ca-pub-1234567890123456' }, { dev: false });
    expect(ok.provider).toBe('google');
    expect(ok.adClient).toBe('ca-pub-1234567890123456');
  });

  it('provedor simulado nunca vale em produção', () => {
    expect(resolveConfig({ VITE_ADS_PROVIDER: 'dev' }, { dev: false }).provider).toBe('off');
    expect(resolveConfig({}, { dev: false, search: '?ads=dev' }).provider).toBe('off');
    expect(resolveConfig({ VITE_ADS_PROVIDER: 'dev' }, { dev: true }).provider).toBe('dev');
    expect(resolveConfig({}, { dev: true, search: '?ads=dev' }).provider).toBe('dev');
  });

  it('frequência configurável e limitada a valores seguros', () => {
    const c = resolveConfig(
      { VITE_ADS_INTERSTITIAL_EVERY_RUNS: '4', VITE_ADS_INTERSTITIAL_MIN_INTERVAL_S: '90', VITE_ADS_REWARDED_REVIVES: '0' },
      { dev: false },
    );
    expect(c.interstitial.everyRuns).toBe(4);
    expect(c.interstitial.minIntervalMs).toBe(90_000);
    expect(c.rewarded.revivesPerRun).toBe(0);
    const clamped = resolveConfig({ VITE_ADS_INTERSTITIAL_EVERY_RUNS: '1', VITE_ADS_INTERSTITIAL_MIN_INTERVAL_S: '5' }, { dev: false });
    expect(clamped.interstitial.everyRuns).toBe(2);
    expect(clamped.interstitial.minIntervalMs).toBe(30_000);
    expect(resolveConfig({ VITE_ADS_INTERSTITIAL: 'off' }, { dev: false }).interstitial.enabled).toBe(false);
  });
});
