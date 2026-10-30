import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { AppContext } from '../createApp';
import { createSession, destroySession, DUMMY_HASH, hashPassword, requireAuth, verifyPassword } from '../auth/auth';
import { HttpError, parse } from '../lib/http';
import { isValidName, NAME_MAX, NAME_MIN, nameKey, sanitizeName } from '../lib/names';

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72; // limite do bcrypt

const credentials = z.object({
  name: z
    .string()
    .transform(sanitizeName)
    .refine(isValidName, `Use de ${NAME_MIN} a ${NAME_MAX} caracteres, com pelo menos uma letra ou número.`),
  password: z
    .string()
    .min(PASSWORD_MIN, `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
    .max(PASSWORD_MAX, `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`)
    // o bcrypt só considera os primeiros 72 bytes; acentos e emojis ocupam mais de 1 byte
    .refine((p) => Buffer.byteLength(p, 'utf8') <= PASSWORD_MAX, 'Senha longa demais.'),
});

const publicPlayer = (p: { id: string; name: string; createdAt: Date }) => ({ id: p.id, name: p.name, createdAt: p.createdAt.toISOString() });

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const { prisma, config } = ctx;
  const secure = config.NODE_ENV === 'production';
  const strict = { config: { rateLimit: { max: config.NODE_ENV === 'test' ? 1000 : 10, timeWindow: '1 minute' } } };

  app.post('/api/auth/register', strict, async (req, reply) => {
    const body = parse(credentials, req.body);
    const key = nameKey(body.name);
    if (await prisma.player.findUnique({ where: { nameKey: key } })) throw new HttpError(409, 'Esse apelido já tem dono. Entre com a senha ou escolha outro.');
    let player;
    try {
      player = await prisma.player.create({ data: { name: body.name, nameKey: key, passwordHash: await hashPassword(body.password) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new HttpError(409, 'Esse apelido já tem dono. Entre com a senha ou escolha outro.');
      throw e;
    }
    await createSession(prisma, reply, { playerId: player.id, ttlDays: config.SESSION_TTL_DAYS, secure, userAgent: req.headers['user-agent'] });
    return reply.status(201).send({ player: publicPlayer(player) });
  });

  app.post('/api/auth/login', strict, async (req, reply) => {
    const body = parse(credentials, req.body);
    const player = await prisma.player.findUnique({ where: { nameKey: nameKey(body.name) } });
    // sempre roda o bcrypt, exista ou não o apelido
    const ok = await verifyPassword(body.password, player?.passwordHash ?? DUMMY_HASH);
    if (!player || !ok) throw new HttpError(401, 'Apelido ou senha incorretos.');
    await createSession(prisma, reply, { playerId: player.id, ttlDays: config.SESSION_TTL_DAYS, secure, userAgent: req.headers['user-agent'] });
    return { player: publicPlayer(player) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(prisma, req, reply);
    return { ok: true };
  });

  // TEMPORÁRIO: troca de senha pelo administrador (só existe com ADMIN_RESET_TOKEN definido).
  app.post('/api/admin/reset-password', strict, async (req) => {
    const expected = process.env.ADMIN_RESET_TOKEN ?? '';
    const got = String(req.headers['x-admin-token'] ?? '');
    const ok =
      expected.length >= 32 &&
      got.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    if (!ok) throw new HttpError(404, 'Não encontrado');
    const body = parse(credentials, req.body);
    const updated = await prisma.player.updateMany({ where: { nameKey: nameKey(body.name) }, data: { passwordHash: await hashPassword(body.password) } });
    return { updated: updated.count };
  });

  app.get('/api/auth/me', async (req) => {
    const auth = requireAuth(req);
    const player = await prisma.player.findUniqueOrThrow({ where: { id: auth.playerId } });
    return { player: publicPlayer(player) };
  });
}
