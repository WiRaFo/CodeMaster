import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ObjectStorage } from './infrastructure/storage/local-storage.ts';
import { randomUUID } from 'node:crypto';
import { registerErrorHandling } from './http/errors.ts';
import { adminRoutes } from './modules/admin/admin.routes.ts';
import { authRoutes } from './modules/auth/auth.routes.ts';
import { branchRoutes } from './modules/branches/branches.routes.ts';
import { contentRoutes } from './modules/content/content.routes.ts';
import { exhibitionRoutes } from './modules/exhibitions/exhibitions.routes.ts';
import { catalogRoutes } from './modules/catalog/catalog.routes.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import { referenceRoutes } from './modules/reference/reference.routes.ts';

export interface AppOptions {
  db: PrismaClient;
  storage: ObjectStorage;
  logLevel?: string;
  /** Cookie с флагом Secure (production за HTTPS). */
  secureCookies?: boolean;
  allowedOrigins?: readonly string[];
}

/** Сборка приложения без запуска сервера (используется и в тестах через app.inject). */
export async function buildApp({ db, storage, logLevel = 'info', secureCookies = false, allowedOrigins = [] }: AppOptions): Promise<FastifyInstance> {
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
      // Ответы админки и входа содержат служебные данные: не кешируются нигде.
      const privateArea = request.url.startsWith('/api/v1/admin') || request.url.startsWith('/api/v1/auth');
      const cacheable = !privateArea && request.method === 'GET' && reply.statusCode === 200 && request.url.startsWith('/api/v1/');
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
      await api.register(exhibitionRoutes, { db, storage });
      await api.register(authRoutes, { db, secureCookies, allowedOrigins });
      await api.register(adminRoutes, { db, storage, allowedOrigins });
    },
    { prefix: '/api/v1' },
  );
  return app;
}
