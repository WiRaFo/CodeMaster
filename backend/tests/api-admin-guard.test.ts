import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import { buildApp } from '../src/app.ts';
import { LocalStorage } from '../src/infrastructure/storage/local-storage.ts';
import { testDb } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/**
 * S-004/S-005: каждый маршрут /admin, найденный при сборке приложения (а не по списку в тесте),
 * без сессии отвечает 401, а сотруднику без прав — 403. Новый маршрут без проверки прав уронит этот тест.
 */
const EMPTY_ROLE = 'test-no-permissions';
/** Маршруты, доступные любому вошедшему сотруднику: только его собственные уведомления. */
const ANY_STAFF = new Set(['GET /api/v1/admin/notifications', 'POST /api/v1/admin/notifications/:id/read']);

let app: FastifyInstance;
let db: PrismaClient;
let nobody: Client;
const routes: Array<{ method: string; url: string }> = [];

beforeAll(async () => {
  db = testDb();
  app = await buildApp({
    db,
    storage: new LocalStorage(inject('testStorageDir')),
    logLevel: 'silent',
    onRoute: ({ method, url }) => {
      for (const m of Array.isArray(method) ? method : [method]) {
        if (url.startsWith('/api/v1/admin') && m !== 'HEAD') routes.push({ method: m, url });
      }
    },
  });
  await app.ready();
  await db.role.upsert({ where: { code: EMPTY_ROLE }, update: {}, create: { code: EMPTY_ROLE, nameRu: 'Тест без прав', nameKk: 'Тест', nameEn: 'Test' } });
  const user = await createStaff(db, EMPTY_ROLE);
  nobody = await login(app, user.email, undefined, '10.9.0.1');
});

afterAll(async () => {
  await cleanupStaff(db);
  await db.role.deleteMany({ where: { code: EMPTY_ROLE } });
  await app.close();
  await db.$disconnect();
});

const concrete = (url: string) => url.replace(/:entity/g, 'documents').replace(/:action/g, 'publish').replace(/:[A-Za-z]+/g, randomUUID());

describe('все маршруты /admin закрыты на сервере', () => {
  it('маршрутов найдено достаточно (защита от пустой проверки)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(30);
  });

  it('без сессии — 401 UNAUTHENTICATED на каждом маршруте и методе', async () => {
    const failures: string[] = [];
    for (const r of routes) {
      const res = await app.inject({ method: r.method as 'GET', url: concrete(r.url), payload: r.method === 'GET' ? undefined : {} });
      if (res.statusCode !== 401) failures.push(`${r.method} ${r.url} → ${res.statusCode}`);
    }
    expect(failures).toEqual([]);
  });

  it('сотрудник без прав — 403 FORBIDDEN, данные не отдаются и не меняются', async () => {
    const failures: string[] = [];
    const auditBefore = await db.auditLog.count({ where: { userId: { not: null }, action: { notIn: ['login', 'login_failed'] } } });
    for (const r of routes) {
      if (ANY_STAFF.has(`${r.method} ${r.url}`)) continue;
      const res = await nobody.request(r.method, concrete(r.url), r.method === 'GET' ? undefined : {});
      const code = (res.body['error'] as { code?: string } | undefined)?.code;
      if (res.status !== 403 || code !== 'FORBIDDEN') failures.push(`${r.method} ${r.url} → ${res.status} ${code ?? ''}`);
    }
    expect(failures).toEqual([]);
    const auditAfter = await db.auditLog.count({ where: { userId: { not: null }, action: { notIn: ['login', 'login_failed'] } } });
    expect(auditAfter).toBe(auditBefore);
  });
});
