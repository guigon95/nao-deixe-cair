import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AppContext } from '../createApp';
import { GAME_IDS, MAX_SCORE, RANKING_SIZE, SCORE_LIMITS, type GameId } from '../lib/games';
import { HttpError, parse } from '../lib/http';
import { isValidName, NAME_MAX, NAME_MIN, nameKey, sanitizeName } from '../lib/names';
import { issueRunToken, verifyRunToken } from '../lib/runToken';
import { previousWeek, weekWindow, type WeekWindow } from '../lib/week';
import { maxCoinsFor } from '../lib/shop';
import { creditCoins, toWalletDto } from './wallet.routes';

const gameSchema = z.enum(GAME_IDS, { message: 'Jogo desconhecido' });
const periodSchema = z.enum(['week', 'all'], { message: 'Período inválido' }).default('all');

const submitSchema = z.object({
  token: z.string().min(10).max(500),
  score: z.number().int('Pontuação inválida').positive('Pontuação inválida').max(MAX_SCORE, 'Pontuação inválida'),
  /** Só para quem joga sem conta. Com sessão, o nome é o da conta. */
  name: z.string().optional(),
  /** Moedas pegas na partida (com conta, vão para a carteira na nuvem). */
  coins: z.number().int().min(0).max(1000).optional(),
});

interface Row {
  id: string;
  name: string;
  score: number;
  playerId: string | null;
  createdAt: Date;
}

/** Janela de tempo do ranking (semanal) ou null (geral). */
type Window = WeekWindow | null;

/**
 * Melhor pontuação de cada conta + cada pontuação de convidado, dentro da
 * janela (semana) quando houver. Empate: quem fez primeiro fica na frente.
 * Todos os valores vão como parâmetros (Prisma.sql), nunca colados no SQL.
 */
const bestPerEntrant = (game: GameId, w: Window) => Prisma.sql`
  SELECT DISTINCT ON (COALESCE(s."playerId", s."id"))
    s."id", COALESCE(p."name", s."name") AS "name", s."score", s."playerId", s."createdAt"
  FROM "Score" s
  LEFT JOIN "Player" p ON p."id" = s."playerId"
  WHERE s."game" = ${game}
  ${w ? Prisma.sql`AND s."createdAt" >= ${w.start} AND s."createdAt" < ${w.end}` : Prisma.empty}
  ORDER BY COALESCE(s."playerId", s."id"), s."score" DESC, s."createdAt" ASC`;

export async function topScores(prisma: PrismaClient, game: GameId, w: Window = null, limit = RANKING_SIZE): Promise<Row[]> {
  return prisma.$queryRaw<Row[]>`
    SELECT * FROM (${bestPerEntrant(game, w)}) b ORDER BY b."score" DESC, b."createdAt" ASC LIMIT ${limit}`;
}

/** Posição (1-based) de uma entrada já no ranking. */
async function positionOf(prisma: PrismaClient, game: GameId, entry: { score: number; createdAt: Date }, w: Window = null): Promise<number> {
  const [r] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM (${bestPerEntrant(game, w)}) b
    WHERE b."score" > ${entry.score} OR (b."score" = ${entry.score} AND b."createdAt" < ${entry.createdAt})`;
  return Number(r?.n ?? 0) + 1;
}

/** Melhor partida de uma conta no jogo (na janela, se houver). */
function bestOf(prisma: PrismaClient, game: GameId, playerId: string, w: Window = null) {
  return prisma.score.findFirst({
    where: { game, playerId, ...(w ? { createdAt: { gte: w.start, lt: w.end } } : {}) },
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
  });
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

  /**
   * Top 10 do jogo — geral (`period=all`) ou da semana (`period=week`) — e,
   * com sessão, a melhor posição do jogador. A semanal traz quando termina e
   * o campeão da semana passada (para dar vontade de disputar).
   */
  app.get<{ Params: { game: string }; Querystring: { period?: string } }>('/api/games/:game/ranking', async (req, reply) => {
    const game = parse(gameSchema, req.params.game);
    const period = parse(periodSchema, req.query.period);
    const w = period === 'week' ? weekWindow() : null;
    const rows = await topScores(prisma, game, w);
    let me: { best: number; position: number } | null = null;
    if (req.auth) {
      const best = await bestOf(prisma, game, req.auth.playerId, w);
      if (best) me = { best: best.score, position: await positionOf(prisma, game, best, w) };
    }
    let week: { start: string; end: string; lastChampion: { name: string; score: number } | null } | undefined;
    if (w) {
      const [champ] = await topScores(prisma, game, previousWeek(w), 1);
      week = { start: w.start.toISOString(), end: w.end.toISOString(), lastChampion: champ ? { name: champ.name, score: champ.score } : null };
    }
    // Sem cache: a resposta depende da sessão (logo depois de entrar, "você" tem que aparecer).
    reply.header('cache-control', 'no-store');
    return { game, period, size: RANKING_SIZE, entries: rows.map(toEntry), me, ...(week ? { week } : {}) };
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
      // Sem conta, só entra se a pontuação for top 10 da semana (o geral é
      // ainda mais difícil, então quem entra no geral também entra na semana).
      const top = await topScores(prisma, game, weekWindow());
      if (top.length >= RANKING_SIZE && body.score <= top[top.length - 1].score) {
        throw new HttpError(422, 'Essa pontuação não entra no top 10 da semana.');
      }
    }

    const w = weekWindow();
    const previousBest = auth ? await bestOf(prisma, game, auth.playerId) : null;
    const previousWeekBest = auth ? await bestOf(prisma, game, auth.playerId, w) : null;

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
    // Moedas da partida vão para a carteira da conta (com teto pelo tempo de partida).
    let wallet;
    if (auth && body.coins) {
      const coins = Math.min(body.coins, maxCoinsFor(durationMs));
      if (coins < body.coins) req.log.warn({ game, coins: body.coins, durationMs }, 'moedas acima do teto; creditado o teto');
      wallet = toWalletDto(await creditCoins(prisma, auth.playerId, game, coins));
    }
    const weekBestIsNew = !previousWeekBest || created.score > previousWeekBest.score;
    const weekBest = weekBestIsNew ? created : previousWeekBest!;
    return reply.status(201).send({
      entry: toEntry({ id: best.id, name, score: best.score, playerId: auth?.playerId ?? null, createdAt: best.createdAt }),
      position,
      personalBest,
      score: created.score,
      week: {
        position: await positionOf(prisma, game, weekBest, w),
        best: weekBest.score,
        personalBest: weekBestIsNew,
        end: w.end.toISOString(),
      },
      ...(wallet ? { wallet } : {}),
    });
  });
}
