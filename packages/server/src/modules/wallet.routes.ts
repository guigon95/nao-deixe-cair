import type { FastifyInstance } from 'fastify';
import type { PrismaClient, Wallet } from '@prisma/client';
import { z } from 'zod';
import type { AppContext } from '../createApp';
import { requireAuth } from '../auth/auth';
import { GAME_IDS, type GameId } from '../lib/games';
import { HttpError, parse } from '../lib/http';
import { DEFAULT_SKIN, DEFAULT_TRAIL, findItem, freeItems, IMPORT_MAX_COINS } from '../lib/shop';

const gameSchema = z.enum(GAME_IDS, { message: 'Jogo desconhecido' });
const itemSchema = z.object({ item: z.string().min(1).max(40) });
const importSchema = z.object({
  coins: z.number().int().min(0).max(1_000_000),
  owned: z.array(z.string().max(40)).max(100),
  skin: z.string().max(40).optional(),
  trail: z.string().max(40).optional(),
});

export interface WalletDto {
  coins: number;
  owned: string[];
  skin: string;
  trail: string;
  imported: boolean;
}

export const toWalletDto = (w: Wallet): WalletDto => ({ coins: w.coins, owned: w.owned, skin: w.skin, trail: w.trail, imported: w.imported });

/** Carteira da conta no jogo (cria vazia, com os itens grátis, na primeira vez). */
export function getWallet(prisma: PrismaClient, playerId: string, game: GameId): Promise<Wallet> {
  return prisma.wallet.upsert({
    where: { playerId_game: { playerId, game } },
    create: { playerId, game, owned: freeItems(game), skin: DEFAULT_SKIN, trail: DEFAULT_TRAIL },
    update: {},
  });
}

/** Credita moedas pegas numa partida (chamado no envio da pontuação). */
export async function creditCoins(prisma: PrismaClient, playerId: string, game: GameId, coins: number): Promise<Wallet> {
  await getWallet(prisma, playerId, game);
  return prisma.wallet.update({ where: { playerId_game: { playerId, game } }, data: { coins: { increment: Math.max(0, coins) } } });
}

export async function walletRoutes(app: FastifyInstance, ctx: AppContext) {
  const { prisma, config } = ctx;
  const limit = (max: number) => ({ config: { rateLimit: { max: config.NODE_ENV === 'test' ? 10_000 : max, timeWindow: '1 minute' } } });

  app.get<{ Params: { game: string } }>('/api/games/:game/wallet', async (req, reply) => {
    const game = parse(gameSchema, req.params.game);
    const auth = requireAuth(req);
    reply.header('cache-control', 'no-store');
    return { wallet: toWalletDto(await getWallet(prisma, auth.playerId, game)) };
  });

  /**
   * Primeira vez que a conta entra: traz moedas e itens que estavam só neste
   * aparelho. Acontece uma única vez por conta (depois, o servidor manda).
   */
  app.post<{ Params: { game: string } }>('/api/games/:game/wallet/import', limit(10), async (req) => {
    const game = parse(gameSchema, req.params.game);
    const auth = requireAuth(req);
    const body = parse(importSchema, req.body);
    const w = await getWallet(prisma, auth.playerId, game);
    if (w.imported) return { wallet: toWalletDto(w), imported: false };
    const valid = body.owned.filter((id) => findItem(game, id));
    const owned = Array.from(new Set([...w.owned, ...valid]));
    const skin = body.skin && owned.includes(body.skin) && findItem(game, body.skin)?.kind === 'skin' ? body.skin : w.skin;
    const trail = body.trail && owned.includes(body.trail) && findItem(game, body.trail)?.kind === 'trail' ? body.trail : w.trail;
    // updateMany com imported=false: dois aparelhos ao mesmo tempo não importam duas vezes
    const r = await prisma.wallet.updateMany({
      where: { playerId: auth.playerId, game, imported: false },
      data: { imported: true, coins: { increment: Math.min(body.coins, IMPORT_MAX_COINS) }, owned, skin, trail },
    });
    const fresh = await getWallet(prisma, auth.playerId, game);
    return { wallet: toWalletDto(fresh), imported: r.count === 1 };
  });

  /** Compra (se tiver moedas) e já usa o item. Comprar o que já tem só equipa. */
  app.post<{ Params: { game: string } }>('/api/games/:game/shop/buy', limit(60), async (req) => {
    const game = parse(gameSchema, req.params.game);
    const auth = requireAuth(req);
    const { item } = parse(itemSchema, req.body);
    const it = findItem(game, item);
    if (!it) throw new HttpError(404, 'Item não encontrado');
    const w = await getWallet(prisma, auth.playerId, game);
    const equip = it.kind === 'skin' ? { skin: it.id } : { trail: it.id };
    if (w.owned.includes(it.id)) {
      const up = await prisma.wallet.update({ where: { playerId_game: { playerId: auth.playerId, game } }, data: equip });
      return { wallet: toWalletDto(up) };
    }
    // Atômico: só desconta se ainda houver saldo e o item não tiver sido comprado.
    const r = await prisma.wallet.updateMany({
      where: { playerId: auth.playerId, game, coins: { gte: it.price }, NOT: { owned: { has: it.id } } },
      data: { coins: { decrement: it.price }, owned: { push: it.id }, ...equip },
    });
    if (r.count !== 1) throw new HttpError(422, `Faltam moedas: esse item custa ${it.price}.`);
    return { wallet: toWalletDto(await getWallet(prisma, auth.playerId, game)) };
  });

  app.post<{ Params: { game: string } }>('/api/games/:game/shop/equip', limit(60), async (req) => {
    const game = parse(gameSchema, req.params.game);
    const auth = requireAuth(req);
    const { item } = parse(itemSchema, req.body);
    const it = findItem(game, item);
    const w = await getWallet(prisma, auth.playerId, game);
    if (!it || !w.owned.includes(it.id)) throw new HttpError(422, 'Você ainda não tem esse item.');
    const up = await prisma.wallet.update({
      where: { playerId_game: { playerId: auth.playerId, game } },
      data: it.kind === 'skin' ? { skin: it.id } : { trail: it.id },
    });
    return { wallet: toWalletDto(up) };
  });
}
