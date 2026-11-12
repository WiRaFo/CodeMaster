import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idOf, testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/**
 * Публикации «Цифровой истории» в панели (F-149): права черновика и публикации, связи с тематиками, местами,
 * документом, личностями и событиями; сайт показывает только опубликованное и не раскрывает закрытый документ.
 */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let editor: Client;
let writer: Client;
let moderator: Client;

const SLUG = 'test-publication-admin';
const ROLE = 'test-publication-writer';

beforeAll(async () => {
  t = await testApp();
  // Роль только с правом черновиков: публиковать ей нельзя.
  const permission = await t.db.permission.findUniqueOrThrow({ where: { code: 'publications:edit' } });
  await t.db.role.create({ data: { code: ROLE, nameRu: 'Тест', nameKk: 'Тест', nameEn: 'Test', permissions: { create: { permissionId: permission.id } } } });
  editor = await login(t.app, (await createStaff(t.db, 'editor')).email, undefined, '10.0.12.1');
  writer = await login(t.app, (await createStaff(t.db, ROLE)).email, undefined, '10.0.12.2');
  moderator = await login(t.app, (await createStaff(t.db, 'moderator')).email, undefined, '10.0.12.3');
});
afterAll(async () => {
  await t.db.publication.deleteMany({ where: { slug: SLUG } });
  await cleanupStaff(t.db);
  await t.db.role.deleteMany({ where: { code: ROLE } });
  await t.close();
});

const paths = (body: Record<string, unknown>) => (body['error'] as { details: Array<{ path: Array<string | number> }> }).details.map((d) => d.path.join('.'));
const site = (url: string) => t.app.inject({ method: 'GET', url });

describe('публикации в панели', () => {
  let id = '';
  let updatedAt = '';
  let personId = '';
  let eventId = '';
  let closedDoc = '';
  const input = (over: Record<string, unknown> = {}) => ({
    slug: SLUG, kind: 'article', periodText: '', yearFrom: 1950, yearTo: 1960, published: false, featured: false, dataOrigin: 'demo',
    sourceNote: '[Демо] Проверочный источник', authorship: '', sourceUrl: '', documentId: '',
    topics: [], settlements: [], personIds: [], eventIds: [],
    translations: { ru: { title: '[Демо] Проверочная публикация', lead: '', bodyText: 'Первый абзац.\n\nВторой абзац.' } },
    ...over,
  });

  beforeAll(async () => {
    personId = (await t.db.historicalPerson.findUniqueOrThrow({ where: { slug: 'auezov-mukhtar' }, select: { id: true } })).id;
    const event = await t.db.historicalEvent.findFirstOrThrow({ where: { publicationStatus: 'published', deletedAt: null }, select: { id: true } });
    eventId = event.id;
    closedDoc = await idOf(t.db, 'documents', 'TEST-1/1/1/3');
  });

  it('модератор получает 403; ввод проверяется: годы, https, источник, неизвестные связи', async () => {
    expect((await moderator.request('GET', '/api/v1/admin/memory/publications')).status).toBe(403);
    expect((await moderator.request('POST', '/api/v1/admin/memory/publications', input())).status).toBe(403);
    const bad = await editor.request('POST', '/api/v1/admin/memory/publications', input({ yearFrom: 1970, sourceUrl: 'http://x.kz', sourceNote: '', topics: ['a', 'a'] }));
    expect(bad.status).toBe(400);
    expect(paths(bad.body)).toEqual(expect.arrayContaining(['yearTo', 'sourceUrl', 'sourceNote', 'topics']));
    const unknownTopic = await editor.request('POST', '/api/v1/admin/memory/publications', input({ topics: ['no-such-topic'] }));
    expect(paths(unknownTopic.body)).toEqual(['topics.0']);
    const unknownPerson = await editor.request('POST', '/api/v1/admin/memory/publications', input({ personIds: ['00000000-0000-4000-8000-000000000000'] }));
    expect(paths(unknownPerson.body)).toEqual(['personIds.0']);
  });

  it('сотрудник без права публикации сохраняет черновик, но не публикует; черновика нет на сайте', async () => {
    expect((await writer.request('POST', '/api/v1/admin/memory/publications', input({ published: true }))).status).toBe(403);
    const created = await writer.request('POST', '/api/v1/admin/memory/publications', input({ documentId: closedDoc }));
    expect(created.status).toBe(201);
    id = String(created.body['id']);
    updatedAt = String(created.body['updatedAt']);
    expect(created.body).toMatchObject({ published: false, publishedAt: null, document: { id: closedDoc, visible: false } });
    expect((await site(`/api/v1/history/${SLUG}`)).statusCode).toBe(404);
    expect(await t.db.auditLog.findFirst({ where: { entityType: 'publication', entityId: id, action: 'create' } })).not.toBeNull();
  });

  it('публикация со связями: сайт показывает личность, событие, тематику и место, закрытый документ скрыт', async () => {
    const body = input({ published: true, documentId: closedDoc, topics: ['culture_art'], settlements: ['ust-kamenogorsk'], personIds: [personId], eventIds: [eventId] });
    expect((await editor.request('PUT', `/api/v1/admin/memory/publications/${id}`, body, { 'if-match': '2000-01-01T00:00:00.000Z' })).status).toBe(409);
    const res = await editor.request('PUT', `/api/v1/admin/memory/publications/${id}`, body, { 'if-match': updatedAt });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ published: true, topics: ['culture_art'], settlements: ['ust-kamenogorsk'], personIds: [personId], eventIds: [eventId] });
    updatedAt = String(res.body['updatedAt']);

    const page = await site(`/api/v1/history/${SLUG}?lang=ru`);
    expect(page.statusCode).toBe(200);
    const p = page.json() as { document: unknown; persons: Array<{ slug: string }>; events: Array<{ slug: string }>; topics: Array<{ slug: string }>; settlements: Array<{ slug: string }>; bodyText: string };
    expect(p.document).toBeNull();
    expect(page.body).not.toContain(closedDoc);
    expect(p.persons.map((x) => x.slug)).toEqual(['auezov-mukhtar']);
    expect(p.events).toHaveLength(1);
    expect(p.topics.map((x) => x.slug)).toEqual(['culture_art']);
    expect(p.settlements.map((x) => x.slug)).toEqual(['ust-kamenogorsk']);
    expect(p.bodyText).toBe('Первый абзац.\n\nВторой абзац.');

    const person = (await site('/api/v1/history/persons/auezov-mukhtar?lang=ru')).json() as { publications: Array<{ slug: string }> };
    expect(person.publications.map((x) => x.slug)).toContain(SLUG);
    const timeline = (await site('/api/v1/history/timeline?lang=ru')).json() as { items: Array<{ publications: Array<{ slug: string }> }> };
    expect(timeline.items.flatMap((e) => e.publications.map((x) => x.slug))).toContain(SLUG);
  });

  it('опубликованное без права публикации не правится; снятие убирает с сайта, дата публикации сохраняется', async () => {
    expect((await writer.request('PUT', `/api/v1/admin/memory/publications/${id}`, input(), { 'if-match': updatedAt })).status).toBe(403);
    const before = await t.db.publication.findUniqueOrThrow({ where: { id }, select: { publishedAt: true } });
    const res = await editor.request('PUT', `/api/v1/admin/memory/publications/${id}`, input(), { 'if-match': updatedAt });
    expect(res.status).toBe(200);
    expect(res.body['published']).toBe(false);
    expect(res.body['publishedAt']).toBe(before.publishedAt?.toISOString());
    expect((await site(`/api/v1/history/${SLUG}`)).statusCode).toBe(404);
    expect((await t.db.publication.findUniqueOrThrow({ where: { id }, select: { publicationStatus: true } })).publicationStatus).toBe('archived');
  });

  it('удаление: только с правом публикации и подтверждением, запись в журнале', async () => {
    expect((await writer.request('DELETE', `/api/v1/admin/memory/publications/${id}`, { confirm: true })).status).toBe(403);
    expect((await editor.request('DELETE', `/api/v1/admin/memory/publications/${id}`, {})).status).toBe(400);
    expect((await editor.request('DELETE', `/api/v1/admin/memory/publications/${id}`, { confirm: true })).status).toBe(204);
    expect((await editor.request('GET', `/api/v1/admin/memory/publications/${id}`)).status).toBe(404);
    expect(await t.db.auditLog.findFirst({ where: { entityType: 'publication', entityId: id, action: 'delete' } })).not.toBeNull();
  });
});
