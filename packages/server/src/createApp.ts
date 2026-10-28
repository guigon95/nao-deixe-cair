// Monta a API (rotas, segurança). Não se chama app.ts de propósito: a Vercel
// procura app.ts antes de index.ts, e a entrada da função tem que ser src/index.ts.
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config';
import { loadAuth } from './auth/auth';
import { errorHandler, HttpError } from './lib/http';
import { authRoutes } from './modules/auth.routes';
import { rankingRoutes } from './modules/ranking.routes';

export interface AppContext {
  prisma: PrismaClient;
  config: AppConfig;
}

/** Header exigido em toda chamada que altera dados (defesa contra CSRF). O front sempre envia. */
export const CSRF_HEADER = 'x-ndc-csrf';

export async function buildApp(opts: { prisma: PrismaClient; config: AppConfig; logger?: boolean | object }): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const ctx: AppContext = { prisma: opts.prisma, config: opts.config };
  const app = Fastify({
    logger:
      opts.logger ??
      (opts.config.NODE_ENV === 'development'
        ? { level: 'info', transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
        : opts.config.NODE_ENV === 'test'
          ? false
          : { level: 'info', redact: ['req.headers.cookie', 'req.headers.authorization'] }),
    trustProxy: true,
    bodyLimit: 16 * 1024,
    genReqId: () => crypto.randomUUID(),
  });

  app.setErrorHandler(errorHandler);
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginEmbedderPolicy: false });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    // Navegadores não mandam header customizado em post de outro site sem preflight de CORS.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers[CSRF_HEADER] !== '1') throw new HttpError(403, 'Requisição recusada');
    await loadAuth(ctx.prisma, req);
  });

  app.get('/api/health', async (_req, reply) => {
    try {
      await ctx.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      app.log.error({ err: e }, 'health: banco inacessível');
      return reply.status(503).send({ ok: false, database: 'unreachable' });
    }
    return { ok: true, database: 'ok', time: new Date().toISOString() };
  });

  await authRoutes(app, ctx);
  await rankingRoutes(app, ctx);

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Não encontrado' }));
  return { app, ctx };
}
