/**
 * Cliente HTTP da API (mesma origem: na Vercel o /api/* vai para o serviço
 * "server"; no `npm run dev` o Vite repassa para localhost:4000).
 * Mesmo padrão do AquaOps: header anti-CSRF fixo, cookie de sessão httpOnly.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
  /** Não chegou ao servidor (sem rede, tempo esgotado) ou o servidor não está disponível. */
  get unavailable(): boolean {
    return this.status === 0 || this.status === 404 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

const CSRF = { 'x-ndc-csrf': '1' };
const TIMEOUT_MS = 8000;

export type Fetcher = typeof fetch;

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<T> {
  const fetcher = init.fetcher ?? fetch;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), init.timeoutMs ?? TIMEOUT_MS) : null;
  let res: Response;
  try {
    res = await fetcher(path, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      credentials: 'same-origin',
      headers: { ...CSRF, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl?.signal,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.');
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = undefined; // ex.: página HTML de 404 de uma hospedagem estática
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | undefined)?.error;
    throw new ApiError(res.status, msg ?? `Falha na requisição (${res.status})`);
  }
  if (data === undefined) throw new ApiError(404, 'Servidor indisponível.'); // 200 sem JSON = não é a nossa API
  return data as T;
}
