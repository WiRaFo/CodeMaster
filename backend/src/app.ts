import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ObjectStorage } from './infrastructure/storage/local-storage.ts';
import { randomUUID } from 'node:crypto';
import { registerErrorHandling } from './http/errors.ts';
import { branchRoutes } from './modules/branches/branches.routes.ts';
import { contentRoutes } from './modules/content/content.routes.ts';
import { catalogRoutes } from './modules/catalog/catalog.routes.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import { referenceRoutes } from './modules/reference/reference.routes.ts';

export interface AppOptions {
  db: PrismaClient;
  storage: ObjectStorage;
  logLevel?: string;
}

/** Сборка приложения без запуска сервера (используется и в тестах через app.inject). */
export async function buildApp({ db, storage, logLevel = 'info' }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: logLevel, redact: ['req.headers.cookie', 'req.headers.authorization'] },
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    routerOptions: { maxParamLength: 200 },
    bodyLimit: 1_048_576,
  });

  registerErrorHandling(app);

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    if (!reply.hasHeader('Cache-Control')) {
      const cacheable = request.method === 'GET' && reply.statusCode === 200 && request.url.startsWith('/api/v1/');
      reply.header('Cache-Control', cacheable ? 'public, max-age=60' : 'no-store');
    }
  });

  await app.register(healthRoutes, { db });
  await app.register(
    async (api) => {
      await api.register(catalogRoutes, { db, storage });
      await api.register(branchRoutes, { db });
      await api.register(referenceRoutes, { db });
      await api.register(contentRoutes, { db });
    },
    { prefix: '/api/v1' },
  );
  return app;
}
