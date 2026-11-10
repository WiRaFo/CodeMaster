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
import { assistantRoutes } from './modules/assistant/assistant.routes.ts';
import { historyRoutes } from './modules/history/history.routes.ts';
import { siteRoutes } from './modules/content/site.routes.ts';
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
  /**
   * Доверие заголовкам X-Forwarded-* (адрес клиента для ограничителей частоты, исходный Host).
   * Включать только за своим обратным прокси: иначе клиент подставит любой адрес. См. TRUST_PROXY.
   */
  trustProxy?: boolean | string;
  /** Наблюдатель за регистрацией маршрутов (тест проверяет, что каждый маршрут /admin закрыт). */
  onRoute?: (route: { method: string | string[]; url: string }) => void;
}

/** Заголовки безопасности для всех ответов API (S-011). Маршрут может задать свою политику CSP. */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

/** Сборка приложения без запуска сервера (используется и в тестах через app.inject). */
export async function buildApp({ db, storage, logLevel = 'info', secureCookies = false, allowedOrigins = [], trustProxy = false, onRoute }: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: logLevel, redact: ['req.headers.cookie', 'req.headers.authorization'] },
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    routerOptions: { maxParamLength: 200 },
    bodyLimit: 1_048_576,
    trustProxy,
  });
  if (onRoute) app.addHook('onRoute', (route) => onRoute({ method: route.method, url: route.url }));

  registerErrorHandling(app);

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    if (!reply.hasHeader('Content-Security-Policy')) reply.header('Content-Security-Policy', API_CSP);
    // HSTS имеет смысл только за HTTPS; тот же признак включает флаг Secure у cookie.
    if (secureCookies) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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
      await api.register(assistantRoutes);
      await api.register(historyRoutes, { db });
      await api.register(siteRoutes, { db, allowedOrigins });
      await api.register(authRoutes, { db, secureCookies, allowedOrigins });
      await api.register(adminRoutes, { db, storage, allowedOrigins });
    },
    { prefix: '/api/v1' },
  );
  return app;
}
