import Fastify from 'fastify';
import { buildApp } from './createApp';
import { loadConfig, type AppConfig } from './config';
import { basePrisma } from './db/prisma';

// Sem top-level await: a Vercel carrega a função compilada como CommonJS.
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

async function main() {
  let config: AppConfig | null = null;
  let startupError: Error | null = null;
  try {
    config = loadConfig();
  } catch (e) {
    startupError = e as Error;
  }

  if (!config) {
    /**
     * Deploy sem banco/segredo configurado: em vez de 500 opaco em toda
     * requisição, responde 503 dizendo o que falta (só nomes de variáveis).
     * O front entende 503 como "sem servidor" e usa o ranking local.
     */
    const app = Fastify({ logger: true });
    app.log.error({ err: startupError }, 'configuração inválida');
    app.all('/*', async (_req, reply) => reply.status(503).send({ error: 'Servidor sem configuração', detail: startupError?.message }));
    await app.listen({ port, host });
    return;
  }

  const prisma = basePrisma();
  const { app } = await buildApp({ prisma, config });
  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((e) => {
  console.error('Erro fatal ao iniciar', e);
  process.exit(1);
});
