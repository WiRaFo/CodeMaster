import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';
import { STAFF_PASSWORD, cleanupStaff, createStaff, login, type Client } from './staff.ts';

type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
const users: Record<string, { id: string; email: string }> = {};
const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();

beforeAll(async () => {
  t = await testApp();
  for (const role of ['super_admin', 'archivist', 'moderator', 'analyst']) users[role] = await createStaff(t.db, role);
});
afterAll(async () => {
  await cleanupStaff(t.db);
  await t.close();
});

const auditCount = (where: Record<string, unknown>) => t.db.auditLog.count({ where });

describe('вход (S-002, S-003, S-007, S-008, S-010)', () => {
  it('анонимный запрос к админке — 401, пароль хранится только как хеш argon2id', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/admin/documents' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    const user = await t.db.user.findUniqueOrThrow({ where: { id: users['archivist']!.id } });
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user.passwordHash).not.toContain(STAFF_PASSWORD);
  });

  it('неверный пароль — 401 без подсказки, попытка в журнале; верный — cookie HttpOnly и SameSite=Strict', async () => {
    const email = users['archivist']!.email;
    const bad = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'wrong' }, remoteAddress: '10.1.0.1' });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    const unknown = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'nobody@archive.test', password: 'wrong' }, remoteAddress: '10.1.0.1' });
    expect(unknown.json()).toEqual({ error: expect.objectContaining({ code: 'INVALID_CREDENTIALS', message: bad.json().error.message }) });
    expect(await auditCount({ action: 'login_failed', userId: users['archivist']!.id })).toBeGreaterThan(0);

    const ok = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: email.toUpperCase(), password: STAFF_PASSWORD }, remoteAddress: '10.1.0.2' });
    expect(ok.statusCode).toBe(200);
    const cookie = String(ok.headers['set-cookie']);
    expect(cookie).toMatch(/^sid=[A-Za-z0-9_-]{40,}; Path=\/api; HttpOnly; SameSite=Strict/);
    expect(ok.headers['cache-control']).toBe('no-store');
    const body = ok.json() as { permissions: string[]; csrfToken: string };
    expect(body.permissions).toContain('catalog:edit');
    expect(body.permissions).not.toContain('catalog:publish');
    // В базе нет токена сессии в открытом виде.
    const token = cookie.split(';')[0]!.slice(4);
    expect(await t.db.session.count({ where: { tokenHash: token } })).toBe(0);
    expect(await auditCount({ action: 'login', userId: users['archivist']!.id })).toBeGreaterThan(0);

    const me = await t.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookie.split(';')[0]! } });
    expect(me.json()).toMatchObject({ user: { email }, csrfToken: body.csrfToken, roles: [{ code: 'archivist' }] });
  });

  it('изменяющий запрос без CSRF-токена или с чужого сайта — 403', async () => {
    const c = await login(t.app, users['archivist']!.email);
    const payload = { caseId: '00000000-0000-4000-8000-000000000000' };
    const noToken = await t.app.inject({ method: 'POST', url: '/api/v1/admin/documents', headers: { cookie: c.cookie }, payload });
    expect(noToken.statusCode).toBe(403);
    expect(noToken.json()).toMatchObject({ error: { code: 'CSRF_FAILED' } });
    const wrongToken = await t.app.inject({ method: 'POST', url: '/api/v1/admin/documents', headers: { cookie: c.cookie, 'x-csrf-token': 'a'.repeat(64) }, payload });
    expect(wrongToken.statusCode).toBe(403);
    const foreign = await t.app.inject({
      method: 'POST',
      url: '/api/v1/admin/documents',
      headers: { cookie: c.cookie, 'x-csrf-token': c.csrf, origin: 'https://evil.example', host: 'archive.local' },
      payload,
    });
    expect(foreign.statusCode).toBe(403);
    const crossSite = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { 'sec-fetch-site': 'cross-site' }, payload: { email: 'x@y.z', password: 'p' } });
    expect(crossSite.statusCode).toBe(403);
  });

  it('6-я попытка входа за минуту — 429; 10 неудач подряд блокируют учётную запись и пишутся в журнал', async () => {
    const email = users['analyst']!.email;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'wrong' }, remoteAddress: '10.2.0.1' })).statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    // Ещё неудачи с других адресов: всего 10 неверных паролей — блокировка.
    for (let i = 0; i < 5; i++) {
      await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'wrong' }, remoteAddress: `10.3.0.${i + 1}` });
    }
    expect(await auditCount({ action: 'account_locked', userId: users['analyst']!.id })).toBe(1);
    const locked = await t.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: STAFF_PASSWORD }, remoteAddress: '10.4.0.1' });
    expect(locked.statusCode).toBe(429);
    await t.db.user.update({ where: { id: users['analyst']!.id }, data: { lockedUntil: null, failedLoginCount: 0 } });
  });

  it('сессия истекает после 30 минут простоя; выход удаляет сессию', async () => {
    const c = await login(t.app, users['moderator']!.email);
    expect((await c.request('GET', '/api/v1/admin/dashboard')).status).toBe(200);
    const session = await t.db.session.findFirstOrThrow({ where: { userId: users['moderator']!.id }, orderBy: { createdAt: 'desc' } });
    await t.db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(Date.now() - 31 * 60 * 1000) } });
    expect((await c.request('GET', '/api/v1/admin/dashboard')).status).toBe(401);
    expect(await t.db.session.count({ where: { id: session.id } })).toBe(0);

    const again = await login(t.app, users['moderator']!.email);
    const out = await t.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: again.cookie, 'x-csrf-token': again.csrf } });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await again.request('GET', '/api/v1/admin/dashboard')).status).toBe(401);
    expect(await auditCount({ action: 'logout', userId: users['moderator']!.id })).toBe(1);
  });
});

describe('права (S-004, F-141, F-142)', () => {
  it('аналитик без прав каталога получает 403 на каждом маршруте каталога и журнала', async () => {
    const c = await login(t.app, users['analyst']!.email, STAFF_PASSWORD, '10.5.0.1');
    for (const [method, url] of [
      ['GET', '/api/v1/admin/documents'],
      ['GET', '/api/v1/admin/catalog/tree'],
      ['GET', '/api/v1/admin/dashboard'],
      ['GET', '/api/v1/admin/audit-logs'],
      ['GET', '/api/v1/admin/reference'],
      ['POST', '/api/v1/admin/fonds'],
    ] as const) {
      const body = method === 'POST' ? { number: '1', title: 'x', accessLevel: 'closed', dataOrigin: 'demo', branchSlug: 'main' } : undefined;
      expect((await c.request(method, url, body)).status, url).toBe(403);
    }
  });

  it('изменение прав роли действует сразу, без нового входа', async () => {
    const c = await login(t.app, users['analyst']!.email, STAFF_PASSWORD, '10.5.0.2');
    expect((await c.request('GET', '/api/v1/admin/audit-logs')).status).toBe(403);
    const role = await t.db.role.findUniqueOrThrow({ where: { code: 'analyst' } });
    const perm = await t.db.permission.findUniqueOrThrow({ where: { code: 'audit:read' } });
    await t.db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    try {
      expect((await c.request('GET', '/api/v1/admin/audit-logs')).status).toBe(200);
    } finally {
      await t.db.rolePermission.delete({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } } });
    }
    expect((await c.request('GET', '/api/v1/admin/audit-logs')).status).toBe(403);
  });

  it('администратор другого филиала не видит и не меняет документы главного архива', async () => {
    const other = await t.db.branch.findFirstOrThrow({ where: { slug: { not: 'main' } } });
    const branchAdmin = await createStaff(t.db, 'branch_admin', { branchId: other.id });
    const c = await login(t.app, branchAdmin.email, STAFF_PASSWORD, '10.5.0.3');
    const mainDoc = await t.db.document.findFirstOrThrow({ where: { dataOrigin: 'synthetic', deletedAt: null } });
    expect((await c.request('GET', `/api/v1/admin/documents/${mainDoc.id}`)).status).toBe(403);
    const list = await c.request('GET', '/api/v1/admin/documents');
    expect(list.status).toBe(200);
    expect(list.body['total']).toBe(0);
  });
});

describe('цикл согласования (ТЗ §6.7; F-144, F-146, F-150 – F-152, F-154)', () => {
  let admin: Client;
  let archivist: Client;
  let moderator: Client;
  let caseId: string;
  let docId: string;

  const docInput = (over: Record<string, unknown> = {}) => ({
    caseId,
    documentNumber: `D-${suffix}`,
    documentTypeCode: 'organization_record',
    dateFrom: '1961-05',
    dateTo: null,
    originalLanguages: ['ru'],
    accessLevel: 'restricted',
    dataOrigin: 'demo',
    sourceNote: null,
    translations: { ru: { title: `[Демо] Приказ по маслозаводу ${suffix}`, description: null, accessConditions: 'Только в читальном зале.' } },
    ...over,
  });

  beforeAll(async () => {
    admin = await login(t.app, users['super_admin']!.email, STAFF_PASSWORD, '10.6.0.1');
    archivist = await login(t.app, users['archivist']!.email, STAFF_PASSWORD, '10.6.0.2');
    moderator = await login(t.app, users['moderator']!.email, STAFF_PASSWORD, '10.6.0.3');
  });

  it('архивист создаёт фонд, опись и дело черновиками; без подтверждения открытый доступ не ставится', async () => {
    const base = { accessLevel: 'open', dataOrigin: 'demo', yearFrom: 1950, yearTo: 1970 };
    const noConfirm = await archivist.request('POST', '/api/v1/admin/fonds', { ...base, branchSlug: 'main', number: `DEMO-${suffix}`, title: '[Демо] Фонд' });
    expect(noConfirm.status).toBe(400);
    expect(noConfirm.body).toMatchObject({ error: { code: 'CONFIRMATION_REQUIRED' } });
    const fond = await archivist.request('POST', '/api/v1/admin/fonds', { ...base, confirmOpenAccess: true, branchSlug: 'main', number: `DEMO-${suffix}`, title: '[Демо] Фонд' });
    expect(fond.status).toBe(201);
    const dup = await archivist.request('POST', '/api/v1/admin/fonds', { ...base, confirmOpenAccess: true, branchSlug: 'main', number: `DEMO-${suffix}`, title: 'Дубль' });
    expect(dup.status).toBe(409);
    const inv = await archivist.request('POST', '/api/v1/admin/inventories', { ...base, confirmOpenAccess: true, fondId: fond.body['id'], number: '1', title: '[Демо] Опись' });
    const kase = await archivist.request('POST', '/api/v1/admin/cases', { ...base, confirmOpenAccess: true, inventoryId: inv.body['id'], number: '1', title: '[Демо] Дело' });
    expect(kase.status).toBe(201);
    caseId = String(kase.body['id']);
    // Иерархия публикуется тем же циклом: архивист отправляет, модератор одобряет, администратор публикует.
    for (const [entity, id] of [['fonds', fond.body['id']], ['inventories', inv.body['id']], ['cases', caseId]] as const) {
      expect((await archivist.request('POST', `/api/v1/admin/${entity}/${id}/submit`, {})).status).toBe(200);
      expect((await moderator.request('POST', `/api/v1/admin/${entity}/${id}/approve`, {})).status).toBe(200);
      expect((await admin.request('POST', `/api/v1/admin/${entity}/${id}/publish`, {})).status).toBe(200);
    }
    expect(await auditCount({ action: 'create', entityType: 'fonds', entityId: String(fond.body['id']) })).toBe(1);
  });

  it('черновик сохраняется неполным, но на проверку неполная карточка не уходит', async () => {
    const created = await archivist.request('POST', '/api/v1/admin/documents', docInput());
    expect(created.status).toBe(201);
    docId = String(created.body['id']);
    const stored = await t.db.document.findUniqueOrThrow({ where: { id: docId } });
    expect(stored.publicationStatus).toBe('draft');
    expect(stored.dateFrom?.toISOString().slice(0, 10)).toBe('1961-05-01');
    expect(stored.dateTo?.toISOString().slice(0, 10)).toBe('1961-05-31');
    expect(stored.datePrecision).toBe('month');
    expect(stored.periodId).not.toBeNull();

    const submit = await archivist.request('POST', `/api/v1/admin/documents/${docId}/submit`, {});
    expect(submit.status).toBe(422);
    expect(submit.body).toMatchObject({ error: { code: 'INCOMPLETE_RECORD', details: [{ path: ['translations', 'ru', 'description'], code: 'required' }] } });
    const noTitle = await archivist.request('POST', '/api/v1/admin/documents', docInput({ documentNumber: null, translations: { ru: { title: '' } } }));
    expect(noTitle.status).toBe(400);
  });

  it('недопустимые переходы и чужие права отклоняются сервером', async () => {
    expect((await archivist.request('POST', `/api/v1/admin/documents/${docId}/publish`, {})).status).toBe(409);
    expect((await archivist.request('POST', `/api/v1/admin/documents/${docId}/approve`, {})).status).toBe(409);
    expect((await archivist.request('POST', `/api/v1/admin/documents/${docId}/fly`, {})).status).toBe(404);
    expect((await moderator.request('PATCH', `/api/v1/admin/documents/${docId}`, docInput())).status).toBe(403);
  });

  it('полный цикл двумя ролями: отправка → доработка → повторная отправка → одобрение → публикация', async () => {
    const view = await archivist.request('GET', `/api/v1/admin/documents/${docId}`);
    const updatedAt = String(view.body['updatedAt']);
    const complete = docInput({ translations: { ru: { title: `[Демо] Приказ по маслозаводу ${suffix}`, description: 'О премировании рабочих.', accessConditions: 'Только в читальном зале.' } } });
    const stale = await archivist.request('PATCH', `/api/v1/admin/documents/${docId}`, complete, { 'if-match': '2000-01-01T00:00:00.000Z' });
    expect(stale.status).toBe(409);
    expect((await archivist.request('PATCH', `/api/v1/admin/documents/${docId}`, complete, { 'if-match': updatedAt })).status).toBe(200);

    expect((await archivist.request('POST', `/api/v1/admin/documents/${docId}/submit`, {})).body).toMatchObject({ status: 'in_review' });
    const queue = await moderator.request('GET', '/api/v1/admin/notifications');
    expect((queue.body['items'] as Array<{ message: string }>).some((n) => n.message.includes(`Приказ по маслозаводу ${suffix}`))).toBe(true);
    const dash = await moderator.request('GET', '/api/v1/admin/dashboard');
    expect((dash.body['reviewQueue'] as Array<{ id: string }>).some((d) => d.id === docId)).toBe(true);

    expect((await archivist.request('POST', `/api/v1/admin/documents/${docId}/approve`, {})).status).toBe(403);
    const noComment = await moderator.request('POST', `/api/v1/admin/documents/${docId}/request-changes`, {});
    expect(noComment.status).toBe(400);
    expect((await moderator.request('POST', `/api/v1/admin/documents/${docId}/request-changes`, { comment: 'Уточните дату.' })).body).toMatchObject({ status: 'needs_changes' });
    const mine = await archivist.request('GET', '/api/v1/admin/notifications');
    expect((mine.body['items'] as Array<{ message: string }>)[0]?.message).toContain('Уточните дату.');

    expect((await archivist.request('POST', `/api/v1/admin/documents/${docId}/submit`, {})).status).toBe(200);
    expect((await moderator.request('POST', `/api/v1/admin/documents/${docId}/approve`, {})).status).toBe(200);
    expect((await moderator.request('POST', `/api/v1/admin/documents/${docId}/publish`, {})).status).toBe(403);
    // Одобренную карточку архивист уже не правит.
    expect((await archivist.request('PATCH', `/api/v1/admin/documents/${docId}`, complete)).status).toBe(403);

    // До публикации документа на сайте нет.
    expect((await t.get(`/api/v1/catalog/documents/${docId}?lang=ru`)).status).toBe(404);
    expect((await admin.request('POST', `/api/v1/admin/documents/${docId}/publish`, {})).body).toMatchObject({ status: 'published' });
    const pub = await t.get(`/api/v1/catalog/documents/${docId}?lang=ru`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ access: 'restricted', accessConditions: 'Только в читальном зале.', dataOrigin: 'demo' });

    const history = await admin.request('GET', `/api/v1/admin/documents/${docId}`);
    const actions = (history.body['history'] as Array<{ action: string }>).map((h) => h.action);
    expect(actions.filter((a) => a === 'status_change')).toHaveLength(5);
    expect(actions).toContain('create');
    expect(actions).toContain('update');
  });

  it('открытие доступа опубликованного документа — только с подтверждением и отдельной записью журнала', async () => {
    const open = docInput({ accessLevel: 'open', translations: { ru: { title: `[Демо] Приказ по маслозаводу ${suffix}`, description: 'О премировании рабочих.', transcription: 'Приказываю премировать.' } } });
    expect((await admin.request('PATCH', `/api/v1/admin/documents/${docId}`, open)).body).toMatchObject({ error: { code: 'CONFIRMATION_REQUIRED' } });
    expect((await admin.request('PATCH', `/api/v1/admin/documents/${docId}`, { ...open, confirmOpenAccess: true })).status).toBe(200);
    expect(await auditCount({ action: 'access_change', entityId: docId })).toBe(1);
    const pub = await t.get(`/api/v1/catalog/documents/${docId}?lang=ru`);
    expect(pub.body).toMatchObject({ access: 'open', transcription: 'Приказываю премировать.' });
    // Опубликованная карточка не может стать неполной.
    const broken = { ...open, confirmOpenAccess: true, translations: { ru: { title: 'Без описания' } } };
    expect((await admin.request('PATCH', `/api/v1/admin/documents/${docId}`, broken)).status).toBe(422);
  });

  it('снятие с публикации и удаление требуют подтверждения; после них документа на сайте нет', async () => {
    expect((await admin.request('POST', `/api/v1/admin/documents/${docId}/archive`, {})).body).toMatchObject({ error: { code: 'CONFIRMATION_REQUIRED' } });
    expect((await admin.request('POST', `/api/v1/admin/documents/${docId}/archive`, { confirm: true })).status).toBe(200);
    expect((await t.get(`/api/v1/catalog/documents/${docId}?lang=ru`)).status).toBe(404);
    expect((await admin.request('POST', `/api/v1/admin/documents/${docId}/restore`, {})).status).toBe(200);
    expect((await t.get(`/api/v1/catalog/documents/${docId}?lang=ru`)).status).toBe(200);

    expect((await moderator.request('DELETE', `/api/v1/admin/documents/${docId}`, { confirm: true })).status).toBe(403);
    expect((await archivist.request('DELETE', `/api/v1/admin/documents/${docId}`, {})).body).toMatchObject({ error: { code: 'CONFIRMATION_REQUIRED' } });
    expect((await archivist.request('DELETE', `/api/v1/admin/documents/${docId}`, { confirm: true })).status).toBe(204);
    expect((await t.get(`/api/v1/catalog/documents/${docId}?lang=ru`)).status).toBe(404);
    expect((await admin.request('GET', `/api/v1/admin/documents/${docId}`)).status).toBe(404);
    expect(await auditCount({ action: 'delete', entityId: docId })).toBe(1);
  });

  it('журнал доступен главному администратору и содержит действия цикла', async () => {
    const log = await admin.request('GET', `/api/v1/admin/audit-logs?entityId=${docId}`);
    expect(log.status).toBe(200);
    const actions = new Set((log.body['items'] as Array<{ action: string }>).map((i) => i.action));
    for (const a of ['create', 'update', 'status_change', 'access_change', 'delete']) expect(actions.has(a), a).toBe(true);
  });
});
