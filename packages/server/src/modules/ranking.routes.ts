import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AppContext } from '../app';
import { GAME_IDS, MAX_SCORE, RANKING_SIZE, SCORE_LIMITS, type GameId } from '../lib/games';
import { HttpError, parse } from '../lib/http';
import { isValidName, NAME_MAX, NAME_MIN, nameKey, sanitizeName } from '../lib/names';
import { issueRunToken, verifyRunToken } from '../lib/runToken';

const gameSchema = z.enum(GAME_IDS, { errorMap: () => ({ message: 'Jogo desconhecido' }) });

const submitSchema = z.object({
  token: z.string().min(10).max(500),
  score: z.number().int('Pontuação inválida').positive('Pontuação inválida').max(MAX_SCORE, 'Pontuação inválida'),
  /** Só para quem joga sem conta. Com sessão, o nome é o da conta. */
  name: z.string().optional(),
});

interface Row {
  id: string;
  name: string;
  score: number;
  playerId: string | null;
  createdAt: Date;
}

/**
 * Melhor pontuação de cada conta + cada pontuação de convidado.
 * Empate: quem fez primeiro fica na frente.
 */
const bestPerEntrant = (game: GameId) => Prisma.sql`
  SELECT DISTINCT ON (COALESCE(s."playerId", s."id"))
    s."id", COALESCE(p."name", s."name") AS "name", s."score", s."playerId", s."createdAt"
  FROM "Score" s
  LEFT JOIN "Player" p ON p."id" = s."playerId"
  WHERE s."game" = ${game}
  ORDER BY COALESCE(s."playerId", s."id"), s."score" DESC, s."createdAt" ASC`;

export async function topScores(prisma: PrismaClient, game: GameId, limit = RANKING_SIZE): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT * FROM (${bestPerEntrant(game)}) b ORDER BY b."score" DESC, b."createdAt" ASC LIMIT ${limit}`;
}

/** Posição (1-based) de uma entrada já no ranking. */
async function positionOf(prisma: PrismaClient, game: GameId, entry: { score: number; createdAt: Date }): Promise<number> {
  const [r] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (${bestPerEntrant(game)}) b
    WHERE b."score" > ${entry.score} OR (b."score" = ${entry.score} AND b."createdAt" < ${entry.createdAt})`;
  return Number(r?.n ?? 0) + 1;
}

const toEntry = (r: Row) => ({
  id: r.id,
  name: r.name,
  score: r.score,
  date: r.createdAt.toISOString().slice(0, 10),
  ...(r.playerId ? { profileId: r.playerId } : {}),
});

export async function rankingRoutes(app: FastifyInstance, ctx: AppContext) {
  const { prisma, config } = ctx;
  const limit = (max: number) => ({ config: { rateLimit: { max: config.NODE_ENV === 'test' ? 10_000 : max, timeWindow: '1 minute' } } });

  /** Top 10 do jogo e, com sessão, a melhor posição do jogador. */
  app.get<{ Params: { game: string } }>('/api/games/:game/ranking', async (req, reply) => {
    const game = parse(gameSchema, req.params.game);
    const rows = await topScores(prisma, game);
    let me: { best: number; position: number } | null = null;
    if (req.auth) {
      const best = await prisma.score.findFirst({ where: { game, playerId: req.auth.playerId }, orderBy: [{ score: 'desc' }, { createdAt: 'asc' }] });
      if (best) me = { best: best.score, position: await positionOf(prisma, game, best) };
    }
    // Cache curto no navegador; sem cache compartilhado (a resposta depende da sessão).
    reply.header('cache-control', 'private, max-age=5');
    return { game, size: RANKING_SIZE, entries: rows.map(toEntry), me };
  });

  /** Início de partida: devolve o token que acompanha o envio da pontuação. */
  app.post<{ Params: { game: string } }>('/api/games/:game/runs', limit(120), async (req) => {
    const game = parse(gameSchema, req.params.game);
    const { token } = issueRunToken(config.APP_SECRET, game);
    return { token };
  });

  app.post<{ Params: { game: string } }>('/api/games/:game/scores', limit(30), async (req, reply) => {
    const game = parse(gameSchema, req.params.game);
    const body = parse(submitSchema, req.body);
    const run = verifyRunToken(config.APP_SECRET, body.token);
    if (!run || run.game !== game) throw new HttpError(400, 'Partida inválida ou expirada.');

    const durationMs = Math.max(0, Date.now() - run.startedAt);
    const lim = SCORE_LIMITS[game];
    if (body.score > Math.ceil((durationMs / 1000) * lim.perSecond) + lim.slack) {
      req.log.warn({ game, score: body.score, durationMs }, 'pontuação implausível recusada');
      throw new HttpError(422, 'Pontuação não confere com a duração da partida.');
    }

    const auth = req.auth;
    let name: string;
    if (auth) {
      name = auth.name;
    } else {
      name = sanitizeName(body.name ?? '');
      if (!isValidName(name)) throw new HttpError(422, `Use de ${NAME_MIN} a ${NAME_MAX} caracteres, com pelo menos uma letra ou número.`);
      // Convidado não pode usar o apelido de uma conta (evita se passar por alguém).
      if (await prisma.player.findUnique({ where: { nameKey: nameKey(name) } })) {
        throw new HttpError(409, 'Esse apelido é de uma conta. Entre com a senha ou use outro nome.');
      }
      // Sem conta, só entra se a pontuação for top 10.
      const top = await topScores(prisma, game);
      if (top.length >= RANKING_SIZE && body.score <= top[top.length - 1].score) {
        throw new HttpError(422, 'Essa pontuação não entra no top 10.');
      }
    }

    const previousBest = auth
      ? await prisma.score.findFirst({ where: { game, playerId: auth.playerId }, orderBy: [{ score: 'desc' }, { createdAt: 'asc' }] })
      : null;

    let created;
    try {
      created = await prisma.score.create({ data: { game, score: body.score, name, playerId: auth?.playerId ?? null, runId: run.runId, durationMs } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new HttpError(409, 'Essa partida já foi enviada.');
      throw e;
    }

    const personalBest = !previousBest || created.score > previousBest.score;
    const best = personalBest ? created : previousBest!;
    const position = await positionOf(prisma, game, best);
    return reply.status(201).send({
      entry: toEntry({ id: best.id, name, score: best.score, playerId: auth?.playerId ?? null, createdAt: best.createdAt }),
      position,
      personalBest,
      score: created.score,
    });
  });
}
