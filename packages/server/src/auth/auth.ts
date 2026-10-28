import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { HttpError } from '../lib/http';

export const SESSION_COOKIE = 'ndc_session';

export interface AuthContext {
  playerId: string;
  name: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/** Custo 10: seguro e rápido o bastante numa função serverless. */
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
/** Hash fixo para comparar quando o apelido não existe (tempo de resposta parecido). */
export const DUMMY_HASH = '$2b$10$YnUpCpZczY63AHSBoVsi1eVuFmsqEqwM1ik0u1.7E46o3FJwlvujq';

export async function createSession(
  prisma: PrismaClient,
  reply: FastifyReply,
  opts: { playerId: string; ttlDays: number; secure: boolean; userAgent?: string },
) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + opts.ttlDays * 86_400_000);
  await prisma.session.create({ data: { id: sha256(token), playerId: opts.playerId, expiresAt, userAgent: opts.userAgent?.slice(0, 300) } });
  reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: opts.secure, expires: expiresAt });
}

export async function destroySession(prisma: PrismaClient, req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Transforma o cookie de sessão em req.auth (ou deixa vazio). */
export async function loadAuth(prisma: PrismaClient, req: FastifyRequest) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return;
  const session = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { player: true } });
  if (!session || session.expiresAt < new Date()) return;
  req.auth = { playerId: session.playerId, name: session.player.name };
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new HttpError(401, 'Entre na sua conta');
  return req.auth;
}
