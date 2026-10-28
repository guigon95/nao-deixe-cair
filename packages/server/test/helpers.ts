import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ndc_test?schema=public';
export const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
export const SECRET = 'test-secret-0123456789abcdef';

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE "Score", "Session", "Player" CASCADE');
}

export async function makeApp() {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, APP_SECRET: SECRET });
  const { app } = await buildApp({ prisma, config, logger: false });
  return app;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- respostas JSON variadas nos testes
type Res = LightMyRequestResponse & { data: any };

/** Cliente com "pote de cookies" mínimo sobre fastify.inject. */
export class Client {
  cookie = '';
  constructor(private app: FastifyInstance) {}
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const res = await this.app.inject({
      method: method as never,
      url,
      payload: body as never,
      headers: { 'x-ndc-csrf': '1', ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
    });
    const set = res.headers['set-cookie'];
    if (set) {
      const c = (Array.isArray(set) ? set : [set]).map((s) => s.split(';')[0]).find((s) => s.startsWith('ndc_session='));
      if (c) this.cookie = c.endsWith('=') ? '' : c;
    }
    let data: unknown;
    try {
      data = res.json();
    } catch {
      data = undefined;
    }
    return Object.assign(res, { data });
  }
  get = (u: string) => this.req('GET', u);
  post = (u: string, b?: unknown) => this.req('POST', u, b ?? {});
}
