import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL não definida (conecte um banco Neon ao projeto)'),
  /** Assina os tokens de partida. Precisa ser longo e aleatório em produção. */
  APP_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(180),
  /** Definida pela Vercel em tempo de execução. */
  VERCEL: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Só nomes de variáveis, nunca valores.
    throw new Error(`Configuração inválida: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && c.APP_SECRET.startsWith('dev-only')) throw new Error('APP_SECRET precisa ser definida em produção');
  return c;
}
