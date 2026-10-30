import { describe, expect, it } from 'vitest';
import { LocalRanking } from '../ranking/Ranking';
import { MemoryStorage } from '../storage/storage';
import { HUB_KEYS } from '../storage/keys';
import { api, ApiError } from '../online/api';
import { OnlineApi } from '../online/services';
import { PlayerService } from '../online/player';
import { RankingController } from '../online/RankingController';
import { timeLeft } from '../ui/RankingUi';

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown; raw?: string } | 'network';

/** fetch falso: responde pelo caminho e registra as chamadas. */
function fakeFetch(handler: Handler) {
  const calls: { url: string; method: string; body?: unknown; headers: Record<string, string> }[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const r = handler(url, init);
    if (r === 'network') throw new TypeError('Failed to fetch');
    const text = r.raw ?? (r.body === undefined ? '' : JSON.stringify(r.body));
    return new Response(text, { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const entry = (name: string, score: number, profileId?: string) => ({ id: `${name}-${score}`, name, score, date: '2026-10-28', ...(profileId ? { profileId } : {}) });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('cliente da API', () => {
  it('manda o header anti-CSRF e JSON', async () => {
    const f = fakeFetch(() => ({ status: 200, body: { ok: true } }));
    await api('/api/x', { body: { a: 1 }, fetcher: f.fn });
    expect(f.calls[0]).toMatchObject({ method: 'POST', body: { a: 1 } });
    expect(f.calls[0].headers['x-ndc-csrf']).toBe('1');
  });

  it('sem rede, 404 de hospedagem estática e 503 contam como "servidor indisponível"', async () => {
    for (const r of ['network', { status: 404, raw: '<html>' }, { status: 503, body: { error: 'x' } }, { status: 200, raw: '<html>' }] as const) {
      const f = fakeFetch(() => r);
      const e = await api('/api/health', { fetcher: f.fn }).catch((x) => x);
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).unavailable).toBe(true);
    }
  });

  it('erro da API traz a mensagem do servidor', async () => {
    const f = fakeFetch(() => ({ status: 409, body: { error: 'Esse apelido já tem dono.' } }));
    const e = (await api('/api/auth/register', { body: {}, fetcher: f.fn }).catch((x) => x)) as ApiError;
    expect(e.status).toBe(409);
    expect(e.unavailable).toBe(false);
    expect(e.message).toBe('Esse apelido já tem dono.');
  });
});

describe('PlayerService', () => {
  it('sem servidor usa o perfil local de antes', async () => {
    const storage = new MemoryStorage();
    const svc = new PlayerService(storage, new OnlineApi(fakeFetch(() => 'network').fn));
    svc.retryDelays = [0, 0];
    svc.local.signIn('Gui');
    expect(await svc.check()).toMatchObject({ mode: 'local', profile: { name: 'Gui', provider: 'local' } });
    const r = await svc.signIn('local', 'Bia', '', false);
    expect(r).toMatchObject({ profile: { name: 'Bia', provider: 'local' } });
  });

  it('API sem banco (health 503) também é modo local', async () => {
    const svc = new PlayerService(new MemoryStorage(), new OnlineApi(fakeFetch(() => ({ status: 503, body: { ok: false } })).fn));
    svc.retryDelays = [0, 0];
    expect((await svc.check()).mode).toBe('local');
  });

  it('banco acordando: tenta de novo e continua logado (sem pedir login à toa)', async () => {
    let health = 0;
    const f = fakeFetch((url) => {
      if (url === '/api/health') return ++health < 3 ? { status: 503, body: { ok: false } } : { status: 200, body: { ok: true } };
      return { status: 200, body: { player: { id: 'p1', name: 'Gui', createdAt: 'x' } } };
    });
    const svc = new PlayerService(new MemoryStorage(), new OnlineApi(f.fn));
    svc.retryDelays = [0, 0];
    expect(await svc.check()).toMatchObject({ mode: 'online', profile: { id: 'p1', name: 'Gui' } });
    expect(health).toBe(3);
  });

  it('erro passageiro do servidor ao ver a sessão (500) também tenta de novo', async () => {
    let me = 0;
    const f = fakeFetch((url) => {
      if (url === '/api/health') return { status: 200, body: { ok: true } };
      return ++me === 1 ? { status: 500, body: { error: 'x' } } : { status: 200, body: { player: { id: 'p1', name: 'Gui', createdAt: 'x' } } };
    });
    const svc = new PlayerService(new MemoryStorage(), new OnlineApi(f.fn));
    svc.retryDelays = [0, 0];
    expect(await svc.check()).toMatchObject({ mode: 'online', profile: { name: 'Gui' } });
  });

  it('servidor fora do ar: quem já tinha entrado continua aparecendo como conectado', async () => {
    const storage = new MemoryStorage();
    storage.setItem(HUB_KEYS.account, JSON.stringify({ id: 'p1', name: 'Gui', provider: 'online', createdAt: 'x' }));
    const svc = new PlayerService(storage, new OnlineApi(fakeFetch(() => 'network').fn));
    svc.retryDelays = [0, 0];
    expect(await svc.check()).toMatchObject({ mode: 'local', profile: { name: 'Gui', provider: 'online' } });
  });

  it('com servidor: conta logada, guarda o nome para a próxima abertura', async () => {
    const storage = new MemoryStorage();
    const f = fakeFetch((url) =>
      url === '/api/health' ? { status: 200, body: { ok: true } } : { status: 200, body: { player: { id: 'p1', name: 'Gui', createdAt: 'x' } } },
    );
    const svc = new PlayerService(storage, new OnlineApi(f.fn));
    expect(await svc.check()).toMatchObject({ mode: 'online', profile: { id: 'p1', provider: 'online' } });
    expect(new PlayerService(storage).initial().profile).toMatchObject({ name: 'Gui', provider: 'online' });
    await svc.signOut('online');
    expect(storage.getItem(HUB_KEYS.account)).toBe('');
  });

  it('com servidor e ninguém logado', async () => {
    const f = fakeFetch((url) => (url === '/api/health' ? { status: 200, body: { ok: true } } : { status: 401, body: { error: 'Entre' } }));
    expect(await new PlayerService(new MemoryStorage(), new OnlineApi(f.fn)).check()).toEqual({ mode: 'online', profile: null });
  });

  it('valida antes de chamar o servidor e repassa o erro dele', async () => {
    const f = fakeFetch(() => ({ status: 401, body: { error: 'Apelido ou senha incorretos.' } }));
    const svc = new PlayerService(new MemoryStorage(), new OnlineApi(f.fn));
    expect(await svc.signIn('online', 'Gui', '123', false)).toEqual({ error: expect.stringMatching(/6 caracteres/) });
    expect(f.calls).toHaveLength(0);
    expect(await svc.signIn('online', 'Gui', 'senha123', false)).toEqual({ error: 'Apelido ou senha incorretos.' });
    expect(f.calls[0]).toMatchObject({ url: '/api/auth/login', body: { name: 'Gui', password: 'senha123' } });
  });
});

describe('RankingController', () => {
  function online(handler: Handler) {
    const f = fakeFetch(handler);
    const c = new RankingController('bolinha', new OnlineApi(f.fn), new LocalRanking(new MemoryStorage()));
    return { c, calls: f.calls };
  }

  it('pré-busca o token e usa o da partida certa no envio', async () => {
    let n = 0;
    const { c, calls } = online((url, init) => {
      if (url.endsWith('/runs')) return { status: 200, body: { token: `tok${++n}` } };
      if (url.endsWith('/scores')) return { status: 201, body: { entry: entry('Gui', 30, 'p1'), position: 1, personalBest: true, score: 30, echo: init.body } };
      return { status: 200, body: { entries: [entry('Gui', 30, 'p1')], size: 10, me: { best: 30, position: 1 } } };
    });
    c.setOnline(true); // pré-busca tok1
    c.runStarted(1); // partida 1 = tok1, pré-busca tok2
    c.runStarted(2); // partida 2 = tok2 (reiniciou), pré-busca tok3
    await flush();
    const out = await c.submit(2, 30, { name: 'Gui', profile: { id: 'p1', provider: 'online' } });
    expect(out.result?.position).toBe(1);
    const sent = calls.find((x) => x.url.endsWith('/scores'))!;
    expect(sent.body).toEqual({ token: 'tok2', score: 30 }); // com conta não manda nome
    expect(c.entries).toHaveLength(1);
    expect(c.me).toEqual({ best: 30, position: 1 });
  });

  it('convidado manda o nome; erro do servidor vira mensagem', async () => {
    const { c, calls } = online((url) =>
      url.endsWith('/runs') ? { status: 200, body: { token: 't' } } : url.endsWith('/scores') ? { status: 409, body: { error: 'Esse apelido é de uma conta.' } } : { status: 200, body: { entries: [], size: 10, me: null } },
    );
    c.setOnline(true);
    c.runStarted(1);
    const out = await c.submit(1, 12, { name: 'Gui', profile: null });
    expect(out).toEqual({ result: null, message: 'Esse apelido é de uma conta.' });
    expect(calls.find((x) => x.url.endsWith('/scores'))!.body).toMatchObject({ name: 'Gui' });
  });

  it('servidor caiu no envio: salva neste aparelho e avisa', async () => {
    const { c } = online((url) => (url.endsWith('/scores') ? 'network' : url.endsWith('/runs') ? { status: 200, body: { token: 't' } } : { status: 200, body: { entries: [], size: 10, me: null } }));
    c.setOnline(true);
    c.runStarted(1);
    const out = await c.submit(1, 20, { name: 'Gui', profile: { id: 'p1', provider: 'online' } });
    expect(out.offline).toBe(true);
    expect(out.result?.position).toBe(1);
    expect(out.message).toMatch(/só neste aparelho/);
    expect(c.scope).toBe('local');
  });

  it('com conta online envia sempre; convidado e perfil local só se entrar no top 10', async () => {
    const { c } = online(() => ({ status: 200, body: { entries: Array.from({ length: 10 }, (_, i) => entry(`P${i}`, 100 - i)), size: 10, me: null } }));
    c.setOnline(true);
    await c.refresh();
    expect(c.threshold()).toBe(92);
    expect(c.autoSubmit(5, { provider: 'online' })).toBe(true);
    expect(c.autoSubmit(5, null)).toBe(false);
    expect(c.qualifies(5)).toBe(false);
    expect(c.qualifies(95)).toBe(true);
  });

  it('modo local funciona como antes (sem rede nenhuma)', async () => {
    const { c, calls } = online(() => 'network');
    c.setOnline(false);
    c.runStarted(1);
    const out = await c.submit(1, 15, { name: 'Ana', profile: null });
    expect(out.result?.position).toBe(1);
    expect(c.entries.map((e) => e.name)).toEqual(['Ana']);
    expect(calls).toHaveLength(0);
  });

  it('ranking online indisponível ao recarregar → passa para o local', async () => {
    const { c } = online(() => ({ status: 503, body: { error: 'x' } }));
    c.setOnline(true);
    await c.refresh();
    expect(c.scope).toBe('local');
  });
});

describe('Ranking semanal no cliente', () => {
  it('online, o top 10 a bater é o da semana', async () => {
    const all = Array.from({ length: 10 }, (_, i) => entry(`G${i}`, 1000 - i));
    const week = Array.from({ length: 10 }, (_, i) => entry(`S${i}`, 50 - i));
    const f = fakeFetch((url) => ({
      status: 200,
      body: url.includes('period=week')
        ? { entries: week, size: 10, me: null, week: { start: 'a', end: '2026-11-02T03:00:00Z', lastChampion: { name: 'Lenda', score: 900 } } }
        : { entries: all, size: 10, me: null },
    }));
    const c = new RankingController('bolinha', new OnlineApi(f.fn), new LocalRanking(new MemoryStorage()));
    c.setOnline(true);
    await c.refresh();
    expect(c.threshold()).toBe(42);
    expect(c.qualifies(45)).toBe(true);
    expect(c.week?.lastChampion?.name).toBe('Lenda');
    expect(c.entries[0].name).toBe('G0');
    expect(c.weekEntries[0].name).toBe('S0');
  });

  it('formata quanto falta para a semana acabar', () => {
    const now = Date.parse('2026-10-28T23:00:00Z');
    expect(timeLeft('2026-11-02T03:00:00Z', now)).toBe('4d 4h');
    expect(timeLeft('2026-10-29T01:30:00Z', now)).toBe('2h 30min');
    expect(timeLeft('2026-10-28T23:05:00Z', now)).toBe('5min');
    expect(timeLeft('2026-10-28T22:00:00Z', now)).toBe('1min');
  });
});
