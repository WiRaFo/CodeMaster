import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** Новости в панели (ТЗ §5.11, F-100) и фильтры ленты (F-101): рубрика, поиск на любом языке. */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let editor: Client;
let own: Client;
let moderator: Client;
let kurchumId: string;

const SLUG = 'test-news-admin-flow';
const BRANCH_SLUG = 'test-news-branch';

const input = (over: Record<string, unknown> = {}) => ({
  slug: SLUG,
  rubric: 'events',
  branchSlug: null,
  dataOrigin: 'demo',
  sourceUrl: '',
  translations: {
    ru: { title: '[Демо] Выставка о маслозаводах', lead: 'Короткий анонс.', bodyText: 'Первый абзац новости.\n\nВторой абзац новости.' },
    kk: { title: '[Демо] Май зауыттары туралы көрме', lead: '', bodyText: 'Жаңалықтың бірінші азат жолы.' },
  },
  ...over,
});

beforeAll(async () => {
  t = await testApp();
  kurchumId = (await t.db.branch.findUniqueOrThrow({ where: { slug: 'kurchum' }, select: { id: true } })).id;
  editor = await login(t.app, (await createStaff(t.db, 'editor')).email, undefined, '10.0.10.1');
  own = await login(t.app, (await createStaff(t.db, 'branch_admin', { branchId: kurchumId })).email, undefined, '10.0.10.2');
  moderator = await login(t.app, (await createStaff(t.db, 'moderator')).email, undefined, '10.0.10.3');
});
afterAll(async () => {
  await t.db.news.deleteMany({ where: { slug: { in: [SLUG, BRANCH_SLUG] } } });
  await cleanupStaff(t.db);
  await t.close();
});

describe('новости в панели', () => {
  let id = '';
  let updatedAt = '';

  it('редактор создаёт черновик: на сайте его нет, в журнале запись', async () => {
    const res = await editor.request('POST', '/api/v1/admin/news', input());
    expect(res.status).toBe(201);
    id = String(res.body['id']);
    updatedAt = String(res.body['updatedAt']);
    expect(res.body).toMatchObject({ status: 'draft', rubric: 'events', publishedAt: null });
    expect((await t.app.inject({ method: 'GET', url: `/api/v1/news/${SLUG}` })).statusCode).toBe(404);
    expect(await t.db.auditLog.findFirst({ where: { entityType: 'news', entityId: id, action: 'create' } })).not.toBeNull();
  });

  it('проверяет поля: латинский адрес, https-источник, русская версия обязательна; адрес не повторяется', async () => {
    const bad = await editor.request('POST', '/api/v1/admin/news', input({ slug: 'Новость', sourceUrl: 'http://example.kz', translations: { kk: input().translations.kk } }));
    expect(bad.status).toBe(400);
    const paths = ((bad.body['error'] as { details: Array<{ path: string[] }> }).details).map((d) => d.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['slug', 'sourceUrl', 'translations.ru.title']));
    expect((await editor.request('POST', '/api/v1/admin/news', input())).status).toBe(409);
  });

  it('публикация: новость в ленте, находится по-казахски и в своей рубрике; чужой If-Match — 409', async () => {
    expect((await editor.request('POST', `/api/v1/admin/news/${id}/publish`, {}, { 'if-match': '2000-01-01T00:00:00.000Z' })).status).toBe(409);
    const res = await editor.request('POST', `/api/v1/admin/news/${id}/publish`, {}, { 'if-match': updatedAt });
    expect(res.status).toBe(200);
    expect(res.body['status']).toBe('published');
    updatedAt = String(res.body['updatedAt']);

    const kk = await t.app.inject({ method: 'GET', url: `/api/v1/news?lang=kk&q=${encodeURIComponent('зауыттары')}` });
    expect(kk.json().items.map((n: { slug: string }) => n.slug)).toEqual([SLUG]);
    const events = await t.app.inject({ method: 'GET', url: '/api/v1/news?lang=ru&rubric=events' });
    expect(events.json().items.map((n: { slug: string }) => n.slug)).toContain(SLUG);
    const rubrics = events.json().rubrics as Array<{ slug: string; count: number }>;
    expect(rubrics.map((r) => r.slug)).toEqual(['news', 'announcements', 'events']);
    expect(rubrics.find((r) => r.slug === 'events')?.count).toBeGreaterThanOrEqual(1);
    const item = await t.app.inject({ method: 'GET', url: `/api/v1/news/${SLUG}?lang=ru` });
    expect(item.json()).toMatchObject({ title: '[Демо] Выставка о маслозаводах', bodyText: 'Первый абзац новости.\n\nВторой абзац новости.' });
  });

  it('спецсимволы в поиске не ломают запрос', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/v1/news?q=${encodeURIComponent("50%_' OR 1=1 --")}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
  });

  it('модератор без прав на новости получает 403; снятие требует подтверждения и убирает новость с сайта', async () => {
    expect((await moderator.request('GET', '/api/v1/admin/news')).status).toBe(403);
    expect((await editor.request('POST', `/api/v1/admin/news/${id}/unpublish`, {}, { 'if-match': updatedAt })).status).toBe(400);
    const res = await editor.request('POST', `/api/v1/admin/news/${id}/unpublish`, { confirm: true }, { 'if-match': updatedAt });
    expect(res.status).toBe(200);
    expect(res.body['status']).toBe('archived');
    expect((await t.app.inject({ method: 'GET', url: `/api/v1/news/${SLUG}` })).statusCode).toBe(404);
  });

  it('администратор филиала: только своя новость, без публикации; чужая — 404', async () => {
    expect((await own.request('POST', '/api/v1/admin/news', input({ slug: BRANCH_SLUG }))).status).toBe(403);
    const created = await own.request('POST', '/api/v1/admin/news', input({ slug: BRANCH_SLUG, branchSlug: 'kurchum' }));
    expect(created.status).toBe(201);
    const list = await own.request('GET', '/api/v1/admin/news');
    expect((list.body['items'] as Array<{ slug: string }>).map((n) => n.slug)).toEqual([BRANCH_SLUG]);
    expect(list.body).toMatchObject({ branchRequired: true, canPublish: false });
    expect((await own.request('POST', `/api/v1/admin/news/${String(created.body['id'])}/publish`, {})).status).toBe(403);
    expect((await own.request('GET', `/api/v1/admin/news/${id}`)).status).toBe(404);
  });

  it('удаление с подтверждением, запись в журнале', async () => {
    expect((await editor.request('DELETE', `/api/v1/admin/news/${id}`, {})).status).toBe(400);
    expect((await editor.request('DELETE', `/api/v1/admin/news/${id}`, { confirm: true })).status).toBe(204);
    expect((await editor.request('GET', `/api/v1/admin/news/${id}`)).status).toBe(404);
    expect(await t.db.auditLog.findFirst({ where: { entityType: 'news', entityId: id, action: 'delete' } })).not.toBeNull();
  });
});
