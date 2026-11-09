import { PrismaClient } from '@prisma/client';

/** Создаёт клиент Prisma; URL берётся из DATABASE_URL, если не передан явно (тесты передают TEST_DATABASE_URL). */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return databaseUrl ? new PrismaClient({ datasourceUrl: databaseUrl }) : new PrismaClient();
}
