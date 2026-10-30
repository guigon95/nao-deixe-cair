import { inject } from '@vercel/analytics';

/**
 * Vercel Web Analytics (visitantes e páginas vistas). O hub e cada jogo são
 * páginas separadas: cada uma chama isto uma vez ao abrir.
 * Só liga no site publicado: localmente (npm run dev/preview, testes) o
 * script da Vercel não existe e não há o que medir.
 */
export function startAnalytics(): void {
  if (typeof window === 'undefined') return;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return;
  try {
    inject({ mode: import.meta.env.PROD ? 'production' : 'development' });
  } catch {
    /* medição nunca quebra o jogo */
  }
}
