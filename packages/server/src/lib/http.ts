import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new HttpError(422, r.error.issues[0]?.message ?? 'Dados inválidos', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function errorHandler(err: Error & { statusCode?: number }, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) return reply.status(err.statusCode).send({ error: err.message, details: err.details });
  if (err instanceof ZodError) return reply.status(422).send({ error: 'Dados inválidos', details: err.issues });
  if (err.statusCode === 429) return reply.status(429).send({ error: 'Muitas tentativas. Espere um pouco e tente de novo.' });
  if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message });
  req.log.error({ err }, 'erro não tratado');
  return reply.status(500).send({ error: 'Algo deu errado. Tente de novo.' });
}
