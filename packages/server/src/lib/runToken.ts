import crypto from 'node:crypto';
import type { GameId } from './games';

/**
 * Token de partida: o servidor carimba a hora de início e assina. No envio da
 * pontuação ele confere a assinatura, a idade (teto de pontos por segundo) e
 * que aquela partida ainda não foi enviada (runId único no banco).
 * Sem estado: começar uma partida não grava nada.
 */
export const RUN_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

interface Payload {
  g: GameId;
  r: string;
  t: number;
}

const sign = (secret: string, body: string) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

export function issueRunToken(secret: string, game: GameId, now = Date.now()): { token: string; runId: string } {
  const payload: Payload = { g: game, r: crypto.randomUUID(), t: now };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(secret, body)}`, runId: payload.r };
}

export function verifyRunToken(secret: string, token: string, now = Date.now()): { game: GameId; runId: string; startedAt: number } | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = sign(secret, body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (typeof p.r !== 'string' || typeof p.t !== 'number' || typeof p.g !== 'string') return null;
    if (now - p.t > RUN_TOKEN_TTL_MS || p.t > now + 60_000) return null;
    return { game: p.g, runId: p.r, startedAt: p.t };
  } catch {
    return null;
  }
}
