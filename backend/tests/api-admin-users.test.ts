import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';
import { STAFF_PASSWORD, cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** Сотрудники и роли (F-142, F-143): назначение ролей без повышения прав, блокировка закрывает сессии. */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let root: Client;
let siteAdmin: Client;
let siteAdminId: string;
let archivist: Client;
const email = (s: string) => `test-staff-new-${s}-${Math.random().toString(36).slice(2, 6)}@archive.test`;

beforeAll(async () => {
  t = await testApp();
  root = await login(t.app, (await createStaff(t.db, 'super_admin')).email, undefined, '10.0.12.1');
  const sa = await createStaff(t.db, 'site_admin');
  siteAdminId = sa.id;
  siteAdmin = await login(t.app, sa.email, undefined, '10.0.12.2');
  archivist = await login(t.app, (await createStaff(t.db, 'archivist')).email, undefined, '10.0.12.3');
});
afterAll(async () => {
  await cleanupStaff(t.db);
  await t.close();
});

describe('сотрудники', () => {
  it('главный администратор создаёт администратора филиала; тот входит и видит только свой филиал', async () => {
    const e = email('ridder');
    const res = await root.request('POST', '/api/v1/admin/users', { email: e, fullName: 'Тест Риддер', password: STAFF_PASSWORD, roles: [{ code: 'branch_admin', branchSlug: 'ridder' }] });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('passwordHash');
    expect(res.body['roles']).toEqual([expect.objectContaining({ code: 'branch_admin', branchSlug: 'ridder' })]);
    const c = await login(t.app, e, STAFF_PASSWORD, '10.0.12.4');
    const branches = await c.request('GET', '/api/v1/admin/branches');
    expect((branches.body['items'] as Array<{ slug: string }>).map((b) => b.slug)).toEqual(['ridder']);
    const log = await t.db.auditLog.findFirst({ where: { entityType: 'user', entityId: res.body['id'] as string } });
    expect(JSON.stringify([log?.summary, log?.changes])).not.toContain(STAFF_PASSWORD);
  });

  it('роль филиала без филиала и глобальная роль с филиалом — 400; занятая почта — 409', async () => {
    expect((await root.request('POST', '/api/v1/admin/users', { email: email('a'), fullName: 'Тест', password: STAFF_PASSWORD, roles: [{ code: 'branch_admin' }] })).status).toBe(400);
    expect((await root.request('POST', '/api/v1/admin/users', { email: email('b'), fullName: 'Тест', password: STAFF_PASSWORD, roles: [{ code: 'editor', branchSlug: 'ridder' }] })).status).toBe(400);
    expect((await root.request('POST', '/api/v1/admin/users', { email: email('c'), fullName: 'Тест', password: 'short', roles: [{ code: 'editor' }] })).status).toBe(400);
    const e = email('d');
    expect((await root.request('POST', '/api/v1/admin/users', { email: e, fullName: 'Тест', password: STAFF_PASSWORD, roles: [{ code: 'editor' }] })).status).toBe(201);
    expect((await root.request('POST', '/api/v1/admin/users', { email: e.toUpperCase(), fullName: 'Тест', password: STAFF_PASSWORD, roles: [{ code: 'editor' }] })).status).toBe(409);
  });

  it('администратор сайта не выдаёт роли шире своих и не меняет главного администратора', async () => {
    expect((await siteAdmin.request('POST', '/api/v1/admin/users', { email: email('e'), fullName: 'Тест', password: STAFF_PASSWORD, roles: [{ code: 'super_admin' }] })).status).toBe(403);
    expect((await siteAdmin.request('POST', '/api/v1/admin/users', { email: email('f'), fullName: 'Тест', password: STAFF_PASSWORD, roles: [{ code: 'archivist' }] })).status).toBe(403);
    expect((await siteAdmin.request('POST', '/api/v1/admin/users', { email: email('g'), fullName: 'Тест', password: STAFF_PASSWORD, roles: [{ code: 'editor' }] })).status).toBe(201);
    const list = await siteAdmin.request('GET', '/api/v1/admin/users');
    const rootUser = (list.body['items'] as Array<{ id: string; roles: Array<{ code: string }> }>).find((u) => u.roles.some((r) => r.code === 'super_admin'));
    expect(rootUser).toBeDefined();
    expect((await siteAdmin.request('PATCH', `/api/v1/admin/users/${rootUser?.id}`, { fullName: 'Взлом', isActive: false, roles: [{ code: 'editor' }] })).status).toBe(403);
    expect((list.body['roles'] as Array<{ code: string; grantable: boolean }>).find((r) => r.code === 'super_admin')?.grantable).toBe(false);
  });

  it('свои роли и блокировку себя менять нельзя; без права users:manage — 403', async () => {
    const self = await siteAdmin.request('PATCH', `/api/v1/admin/users/${siteAdminId}`, { fullName: 'Тест site_admin', isActive: false, roles: [{ code: 'site_admin' }] });
    expect(self.status).toBe(400);
    expect((await archivist.request('GET', '/api/v1/admin/users')).status).toBe(403);
  });

  it('блокировка закрывает сессию сразу; смена ролей действует со следующего запроса', async () => {
    const e = email('h');
    const created = await root.request('POST', '/api/v1/admin/users', { email: e, fullName: 'Тест блок', password: STAFF_PASSWORD, roles: [{ code: 'archivist' }] });
    const id = created.body['id'] as string;
    const c = await login(t.app, e, STAFF_PASSWORD, '10.0.12.5');
    expect((await c.request('GET', '/api/v1/admin/documents')).status).toBe(200);
    const blocked = await root.request('PATCH', `/api/v1/admin/users/${id}`, { fullName: 'Тест блок', isActive: false, roles: [{ code: 'archivist' }] });
    expect(blocked.status).toBe(200);
    expect((await c.request('GET', '/api/v1/admin/documents')).status).toBe(401);
    const relogin = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: e, password: STAFF_PASSWORD }, remoteAddress: '10.0.12.6' });
    expect(relogin.statusCode).toBe(401);
    const log = await t.db.auditLog.findFirst({ where: { entityType: 'user', entityId: id, action: 'access_change' } });
    expect(log?.summary).toContain('isActive');
  });
});
