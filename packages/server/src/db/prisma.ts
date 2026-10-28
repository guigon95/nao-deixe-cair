import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function basePrisma(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}
