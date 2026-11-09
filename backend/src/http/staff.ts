import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ApiError } from './errors.ts';
import { hasGrant, hashToken, loadGrants, loadSession, safeEqualHex, type ActiveSession, type Grants } from '../modules/auth/session.ts';

export interface Staff {
  session: ActiveSession;
  grants: Grants;
}

declare module 'fastify' {
  interface FastifyRequest {
    staff: Staff | null;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Запрос с чужого сайта отклоняется (S-007): браузер сообщает источник в Origin и Sec-Fetch-Site.
 * Разрешён источник, совпадающий с адресом, по которому пришёл запрос, и источники из ADMIN_ALLOWED_ORIGINS.
 */
export function assertSameOrigin(request: FastifyRequest, allowed: readonly string[]): void {
  const site = request.headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') throw new ApiError(403, 'CSRF_FAILED', 'Cross-site request rejected');
  const origin = request.headers.origin;
  if (!origin) return;
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) ?? request.headers.host;
  const sameAsHost = host !== undefined && (origin === `http://${host}` || origin === `https://${host}`);
  if (!sameAsHost && !allowed.includes(origin)) throw new ApiError(403, 'CSRF_FAILED', 'Origin not allowed');
}

/** CSRF-токен выводится из токена сессии, поэтому его не нужно хранить: в базе только хеш. */
export const csrfFromSessionToken = (sessionToken: string): string => hashToken(`csrf:${sessionToken}`);

/**
 * Все маршруты /admin: нужна действующая сессия (иначе 401), для изменяющих методов — проверка
 * источника и заголовок X-CSRF-Token (иначе 403). Права проверяет requirePermission в каждом маршруте.
 */
export function registerStaffGuard(app: FastifyInstance, db: PrismaClient, allowedOrigins: readonly string[]): void {
  app.addHook('preHandler', async (request) => {
    const session = await loadSession(db, request);
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign-in required');
    if (!SAFE_METHODS.has(request.method)) {
      assertSameOrigin(request, allowedOrigins);
      const header = request.headers['x-csrf-token'];
      const token = typeof header === 'string' ? header : '';
      if (!/^[0-9a-f]{64}$/.test(token) || !safeEqualHex(hashToken(token), session.csrfTokenHash)) {
        throw new ApiError(403, 'CSRF_FAILED', 'CSRF token missing or invalid');
      }
    }
    request.staff = { session, grants: await loadGrants(db, session.userId) };
  });
}

export function staffOf(request: FastifyRequest): Staff {
  if (!request.staff) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign-in required');
  return request.staff;
}

/** Проверка права (S-004). branchId — филиал записи, для прав администратора филиала. */
export function requirePermission(request: FastifyRequest, permission: string, branchId?: string | null): Staff {
  const staff = staffOf(request);
  if (!hasGrant(staff.grants, permission, branchId)) throw new ApiError(403, 'FORBIDDEN', `Permission ${permission} required`);
  return staff;
}
