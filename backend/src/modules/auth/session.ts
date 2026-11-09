import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Имя cookie сессии. Значение — случайный токен; в базе хранится только его SHA-256. */
export const SESSION_COOKIE = 'sid';
/** Скользящий тайм-аут простоя и абсолютный срок жизни сессии (S-010). */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
/** lastSeenAt обновляется не чаще раза в минуту, чтобы каждый запрос не писал в базу. */
const TOUCH_INTERVAL_MS = 60 * 1000;

export const newToken = (): string => randomBytes(32).toString('base64url');
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/** Разбор заголовка Cookie без сторонних библиотек: нужен только один cookie. */
export function readCookie(request: FastifyRequest, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** HttpOnly — cookie недоступна скриптам; SameSite=Strict — не отправляется с чужих сайтов (S-002, S-007). */
export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean): void {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/api', 'HttpOnly', 'SameSite=Strict', `Max-Age=${ABSOLUTE_TTL_MS / 1000}`];
  if (secure) parts.push('Secure');
  reply.header('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.header('Set-Cookie', `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
}

export interface ActiveSession {
  id: string;
  userId: string;
  csrfTokenHash: string;
  email: string;
  fullName: string;
}

/**
 * Сессия по cookie. Истёкшая по простою или абсолютному сроку удаляется.
 * Неактивный или удалённый пользователь сессии не имеет.
 */
export async function loadSession(db: PrismaClient, request: FastifyRequest, now = new Date()): Promise<ActiveSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { email: true, fullName: true, isActive: true, deletedAt: true } } },
  });
  if (!session) return null;
  const idle = now.getTime() - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS;
  if (idle || session.expiresAt <= now || !session.user.isActive || session.user.deletedAt) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return { id: session.id, userId: session.userId, csrfTokenHash: session.csrfTokenHash, email: session.user.email, fullName: session.user.fullName };
}

export interface Grants {
  /** Права без ограничения по филиалу. */
  global: Set<string>;
  /** Права администратора филиала: право → id филиалов. */
  byBranch: Map<string, Set<string>>;
}

/** Права читаются из базы на каждый запрос: изменение прав роли действует сразу (F-142). */
export async function loadGrants(db: PrismaClient, userId: string): Promise<Grants> {
  const rows = await db.$queryRaw<Array<{ code: string; branch_id: string | null }>>`
    SELECT DISTINCT p.code, ur.branch_id
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = ${userId}::uuid`;
  const grants: Grants = { global: new Set(), byBranch: new Map() };
  for (const r of rows) {
    if (r.branch_id === null) grants.global.add(r.code);
    else {
      const set = grants.byBranch.get(r.code) ?? new Set<string>();
      set.add(r.branch_id);
      grants.byBranch.set(r.code, set);
    }
  }
  return grants;
}

export function hasGrant(grants: Grants, permission: string, branchId?: string | null): boolean {
  if (grants.global.has(permission)) return true;
  if (!branchId) return false;
  return grants.byBranch.get(permission)?.has(branchId) ?? false;
}

/** Список прав для интерфейса: глобальные и (с пометкой филиала) ограниченные. */
export function grantList(grants: Grants): string[] {
  return [...new Set([...grants.global, ...grants.byBranch.keys()])].sort();
}
