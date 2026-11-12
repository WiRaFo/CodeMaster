import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import argon2 from 'argon2';
import { loginSchema } from '@archive-vko/shared';
import { ApiError } from '../../http/errors.ts';
import { assertSameOrigin, csrfFromSessionToken } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';
import { LoginLimiter } from './login-limiter.ts';
import {
  ABSOLUTE_TTL_MS,
  SESSION_COOKIE,
  clearSessionCookie,
  grantList,
  hashToken,
  loadGrants,
  loadSession,
  newToken,
  readCookie,
  safeEqualHex,
  setSessionCookie,
} from './session.ts';

/** После 10 неудачных попыток подряд учётная запись блокируется на 15 минут (S-008). */
const LOCK_AFTER = 10;
const LOCK_MS = 15 * 60 * 1000;

export interface AuthOptions {
  db: PrismaClient;
  secureCookies: boolean;
  allowedOrigins: readonly string[];
  limiter?: LoginLimiter;
}

/** Хеш для несуществующего email, чтобы время ответа не выдавало, есть ли такая учётная запись. */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= argon2.hash('dummy-password-for-timing', { type: argon2.argon2id }));

export async function authRoutes(app: FastifyInstance, opts: AuthOptions): Promise<void> {
  const { db } = opts;
  const limiter = opts.limiter ?? new LoginLimiter();

  const invalid = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  const tooMany = () => new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many sign-in attempts, try again later');

  app.post('/auth/login', async (request, reply) => {
    assertSameOrigin(request, opts.allowedOrigins);
    const { email, password } = loginSchema.parse(request.body);
    const audit = (userId: string | null, action: 'login' | 'login_failed' | 'account_locked', summary: string) =>
      writeAudit(db, request, { userId, action, entityType: 'user', ...(userId ? { entityId: userId } : {}), summary, changes: { email } });

    if (!limiter.take(request.ip, email)) {
      await audit(null, 'login_failed', 'Вход отклонён: превышено число попыток');
      throw tooMany();
    }
    const user = await db.user.findFirst({ where: { email, deletedAt: null } });
    const now = new Date();
    if (user?.lockedUntil && user.lockedUntil > now) {
      await audit(user.id, 'login_failed', 'Вход отклонён: учётная запись временно заблокирована');
      throw tooMany();
    }
    const ok = user ? await argon2.verify(user.passwordHash, password) : (await argon2.verify(await getDummyHash(), password), false);
    if (!user || !ok || !user.isActive) {
      if (user) {
        const failed = user.failedLoginCount + 1;
        const lock = failed >= LOCK_AFTER;
        await db.user.update({
          where: { id: user.id },
          data: { failedLoginCount: lock ? 0 : failed, ...(lock ? { lockedUntil: new Date(now.getTime() + LOCK_MS) } : {}) },
        });
        if (lock) await audit(user.id, 'account_locked', `Учётная запись заблокирована на 15 минут после ${LOCK_AFTER} неудачных попыток`);
      }
      await audit(user?.id ?? null, 'login_failed', 'Неудачная попытка входа');
      throw invalid();
    }

    // Новый токен на каждый вход: старая сессия из cookie удаляется (ротация id, S-002).
    const previous = readCookie(request, SESSION_COOKIE);
    if (previous) await db.session.deleteMany({ where: { tokenHash: hashToken(previous) } });
    const token = newToken();
    const csrfToken = csrfFromSessionToken(token);
    await db.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          csrfTokenHash: hashToken(csrfToken),
          expiresAt: new Date(now.getTime() + ABSOLUTE_TTL_MS),
          ip: request.ip,
          userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
        },
      });
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
      await writeAudit(tx, request, { userId: user.id, action: 'login', entityType: 'user', entityId: user.id, summary: 'Вход в панель управления' });
    });
    limiter.reset(request.ip, email);
    setSessionCookie(reply, token, opts.secureCookies);
    return { user: { id: user.id, email: user.email, fullName: user.fullName }, permissions: grantList(await loadGrants(db, user.id)), csrfToken };
  });

  app.get('/auth/me', async (request, reply) => {
    const session = await loadSession(db, request);
    if (!session) {
      clearSessionCookie(reply, opts.secureCookies);
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sign-in required');
    }
    const token = readCookie(request, SESSION_COOKIE) ?? '';
    const roles = await db.userRole.findMany({ where: { userId: session.userId }, include: { role: { select: { code: true, nameRu: true } } } });
    return {
      user: { id: session.userId, email: session.email, fullName: session.fullName },
      roles: roles.map((r) => ({ code: r.role.code, name: r.role.nameRu, branchId: r.branchId })),
      permissions: grantList(await loadGrants(db, session.userId)),
      csrfToken: csrfFromSessionToken(token),
    };
  });

  app.post('/auth/logout', async (request, reply) => {
    assertSameOrigin(request, opts.allowedOrigins);
    const session = await loadSession(db, request);
    if (session) {
      if (!csrfMatches(request, session.csrfTokenHash)) throw new ApiError(403, 'CSRF_FAILED', 'CSRF token missing or invalid');
      await db.session.deleteMany({ where: { id: session.id } });
      await writeAudit(db, request, { userId: session.userId, action: 'logout', entityType: 'user', entityId: session.userId, summary: 'Выход из панели управления' });
    }
    clearSessionCookie(reply, opts.secureCookies);
    return reply.status(204).send();
  });
}

function csrfMatches(request: FastifyRequest, expectedHash: string): boolean {
  const header = request.headers['x-csrf-token'];
  return typeof header === 'string' && /^[0-9a-f]{64}$/.test(header) && safeEqualHex(hashToken(header), expectedHash);
}
