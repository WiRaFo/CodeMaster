import type { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';

export const STAFF_PASSWORD = 'test-password-for-staff-1';
const hashOnce = argon2.hash(STAFF_PASSWORD, { type: argon2.argon2id });

/** Сотрудник с ролью; email с префиксом test-staff-, чтобы его можно было удалить после тестов. */
export async function createStaff(db: PrismaClient, role: string, opts: { branchId?: string; name?: string } = {}): Promise<{ id: string; email: string }> {
  const email = `test-staff-${role}-${Math.random().toString(36).slice(2, 8)}@archive.test`;
  const roleRow = await db.role.findUniqueOrThrow({ where: { code: role } });
  const user = await db.user.create({ data: { email, fullName: opts.name ?? `Тест ${role}`, passwordHash: await hashOnce } });
  await db.userRole.create({ data: { userId: user.id, roleId: roleRow.id, branchId: opts.branchId ?? null } });
  return { id: user.id, email };
}

export interface Client {
  cookie: string;
  csrf: string;
  request(method: string, url: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: Record<string, unknown>; text: string; headers: Record<string, unknown> }>;
}

/** Вход через API; дальше запросы идут с cookie сессии и CSRF-токеном, как из браузера. */
export async function login(app: FastifyInstance, email: string, password = STAFF_PASSWORD, ip = '10.0.0.1'): Promise<Client> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password }, remoteAddress: ip });
  if (res.statusCode !== 200) throw new Error(`login ${email}: ${res.statusCode} ${res.body}`);
  const setCookie = String(res.headers['set-cookie']);
  const cookie = setCookie.split(';')[0] ?? '';
  const csrf = (res.json() as { csrfToken: string }).csrfToken;
  return {
    cookie,
    csrf,
    async request(method, url, body, headers = {}) {
      const r = await app.inject({
        method: method as 'GET',
        url,
        headers: { cookie, 'x-csrf-token': csrf, ...headers },
        ...(body === undefined ? {} : { payload: body as Record<string, unknown> }),
      });
      const json = String(r.headers['content-type'] ?? '').includes('application/json');
      return { status: r.statusCode, body: r.body && json ? (r.json() as Record<string, unknown>) : {}, text: r.body, headers: r.headers };
    },
  };
}

/** Удаляет всё, что создали тестовые сотрудники, и самих сотрудников. */
export async function cleanupStaff(db: PrismaClient): Promise<void> {
  const users = await db.user.findMany({ where: { email: { startsWith: 'test-staff-' } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (!ids.length) return;
  const assets = await db.digitalAsset.findMany({ where: { createdById: { in: ids } }, select: { id: true } });
  await db.documentAsset.deleteMany({ where: { assetId: { in: assets.map((a) => a.id) } } });
  await db.digitalAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } });
  await db.exhibition.deleteMany({ where: { createdById: { in: ids } } });
  await db.document.deleteMany({ where: { createdById: { in: ids } } });
  await db.case.deleteMany({ where: { createdById: { in: ids } } });
  await db.inventory.deleteMany({ where: { createdById: { in: ids } } });
  await db.fond.deleteMany({ where: { createdById: { in: ids } } });
  await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { type: { in: ['submit', 'approve'] } }] } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
