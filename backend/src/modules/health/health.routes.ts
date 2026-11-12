import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

export async function healthRoutes(app: FastifyInstance, opts: { db: PrismaClient }): Promise<void> {
  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/ready', async (request, reply) => {
    try {
      await opts.db.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'ok' } };
    } catch (error) {
      request.log.error({ err: error }, 'database is not ready');
      return reply.status(503).send({ status: 'unavailable', checks: { database: 'failed' } });
    }
  });
}
