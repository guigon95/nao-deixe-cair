/**
 * Build do servidor (local, CI e Vercel):
 * 1. Gera o Prisma Client (inclui o motor do runtime da Vercel).
 * 2. Aplica as migrações SÓ em deploy de produção da Vercel (ou com
 *    MIGRATE_ON_BUILD=true), para um preview nunca mexer no banco de produção.
 *    Sem DATABASE_URL o build segue com um aviso: os jogos continuam no ar e a
 *    API responde 503 até um banco ser conectado (o front cai no ranking local).
 * 3. Empacota a API em dist/index.js.
 */
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('npx prisma generate');
const wantsMigrate = process.env.VERCEL_ENV === 'production' || process.env.MIGRATE_ON_BUILD === 'true';
if (wantsMigrate && !process.env.DATABASE_URL) {
  console.warn('\n⚠ DATABASE_URL não definida: migrações puladas. Conecte um banco Neon ao projeto na Vercel (Storage → Neon) e faça redeploy.\n');
} else if (wantsMigrate) {
  process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;
  run('npx prisma migrate deploy');
} else {
  console.log(`Migrações puladas (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'não definido'}).`);
}
run('npx tsup');
