import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idOf, testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** «Архив памяти» в панели (F-149): события, личности, коллекции. Права, журнал, If-Match, сайт видит только опубликованное. */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let editor: Client;
let moderator: Client;

const EVENT = 'test-memory-event';
const PERSON = 'test-memory-person';
const COLLECTION = 'test-memory-collection';

beforeAll(async () => {
  t = await testApp();
  editor = await login(t.app, (await createStaff(t.db, 'editor')).email, undefined, '10.0.11.1');
  moderator = await login(t.app, (await createStaff(t.db, 'moderator')).email, undefined, '10.0.11.2');
});
afterAll(async () => {
  await t.db.historicalEvent.deleteMany({ where: { slug: EVENT } });
  await t.db.historicalPerson.deleteMany({ where: { slug: PERSON } });
  await t.db.collection.deleteMany({ where: { slug: COLLECTION } });
  await cleanupStaff(t.db);
  await t.close();
});

const paths = (body: Record<string, unknown>) => (body['error'] as { details: Array<{ path: Array<string | number> }> }).details.map((d) => d.path.join('.'));
const site = async (url: string) => t.app.inject({ method: 'GET', url });

describe('события хронологии в панели', () => {
  const input = (over: Record<string, unknown> = {}) => ({
    slug: EVENT, year: 1950, date: '', published: false, dataOrigin: 'demo', sourceNote: '[Демо] Проверочная запись',
    translations: { ru: { title: '[Демо] Проверочное событие', description: 'Описание.' } }, ...over,
  });
  let id = '';
  let updatedAt = '';

  it('модератор без права публикации получает 403, источник и год даты проверяются', async () => {
    expect((await moderator.request('POST', '/api/v1/admin/memory/events', input())).status).toBe(403);
    const bad = await editor.request('POST', '/api/v1/admin/memory/events', input({ sourceNote: '', date: '1951-01-01', translations: {} }));
    expect(bad.status).toBe(400);
    expect(paths(bad.body)).toEqual(expect.arrayContaining(['sourceNote', 'date', 'translations.ru.title']));
  });

  it('черновик не виден на сайте; публикация с верным If-Match показывает событие, чужой — 409', async () => {
    const created = await editor.request('POST', '/api/v1/admin/memory/events', input());
    expect(created.status).toBe(201);
    id = String(created.body['id']);
    updatedAt = String(created.body['updatedAt']);
    const slugs = async () => ((await site('/api/v1/history/timeline')).json() as { items: Array<{ slug: string }> }).items.map((e) => e.slug);
    expect(await slugs()).not.toContain(EVENT);
    expect((await editor.request('PUT', `/api/v1/admin/memory/events/${id}`, input({ published: true }), { 'if-match': '2000-01-01T00:00:00.000Z' })).status).toBe(409);
    const updated = await editor.request('PUT', `/api/v1/admin/memory/events/${id}`, input({ published: true, date: '1950-05-09' }), { 'if-match': updatedAt });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ published: true, date: '1950-05-09' });
    expect(await slugs()).toContain(EVENT);
    expect(await t.db.auditLog.count({ where: { entityType: 'historical_event', entityId: id } })).toBe(2);
  });

  it('удаление требует подтверждения и убирает событие с сайта', async () => {
    expect((await editor.request('DELETE', `/api/v1/admin/memory/events/${id}`, {})).status).toBe(400);
    expect((await editor.request('DELETE', `/api/v1/admin/memory/events/${id}`, { confirm: true })).status).toBe(204);
    const items = ((await site('/api/v1/history/timeline')).json() as { items: Array<{ slug: string }> }).items;
    expect(items.map((e) => e.slug)).not.toContain(EVENT);
    expect((await editor.request('GET', `/api/v1/admin/memory/events/${id}`)).status).toBe(404);
  });
});

describe('личности в панели', () => {
  it('создание с биографией, порядок лет, адрес не повторяется, страница на сайте', async () => {
    const input = (over: Record<string, unknown> = {}) => ({
      slug: PERSON, birthYear: 1900, deathYear: 1980, published: true, dataOrigin: 'demo', sourceNote: '[Демо] Проверка',
      translations: { ru: { fullName: '[Демо] Тестов Тест Тестович', biography: 'Первый абзац.\n\nВторой абзац.' } }, ...over,
    });
    const bad = await editor.request('POST', '/api/v1/admin/memory/persons', input({ birthYear: 1990 }));
    expect(paths(bad.body)).toContain('deathYear');
    const created = await editor.request('POST', '/api/v1/admin/memory/persons', input());
    expect(created.status).toBe(201);
    expect((await editor.request('POST', '/api/v1/admin/memory/persons', input())).status).toBe(409);
    const page = (await site(`/api/v1/history/persons/${PERSON}?lang=ru`)).json() as Record<string, unknown>;
    expect(page).toMatchObject({ fullName: '[Демо] Тестов Тест Тестович', lifeYears: '1900–1980', biography: 'Первый абзац.\n\nВторой абзац.' });
    const list = await editor.request('GET', '/api/v1/admin/memory/persons');
    expect((list.body['items'] as Array<{ slug: string; memorableDates: number }>).find((p) => p.slug === 'burov-pavel')?.memorableDates).toBe(1);
  });
});

describe('коллекции в панели', () => {
  it('панель предупреждает о невидимых элементах, сайт их не показывает; неизвестный элемент — 400', async () => {
    const open = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    const closed = await idOf(t.db, 'documents', 'TEST-1/1/1/3');
    const person = await t.db.historicalPerson.findUniqueOrThrow({ where: { slug: 'burov-pavel' }, select: { id: true } });
    const input = (items: Array<{ type: string; id: string }>) => ({
      slug: COLLECTION, published: true, featured: false, sortOrder: 50, dataOrigin: 'demo',
      translations: { ru: { title: '[Демо] Проверочная коллекция', description: '' } }, items,
    });
    const unknown = await editor.request('POST', '/api/v1/admin/memory/collections', input([{ type: 'document', id: '00000000-0000-4000-8000-000000000000' }]));
    expect(paths(unknown.body)).toEqual(['items.0.id']);
    const dup = await editor.request('POST', '/api/v1/admin/memory/collections', input([{ type: 'document', id: open }, { type: 'document', id: open }]));
    expect(paths(dup.body)).toEqual(['items']);
    const created = await editor.request('POST', '/api/v1/admin/memory/collections', input([{ type: 'document', id: closed }, { type: 'document', id: open }, { type: 'person', id: person.id }]));
    expect(created.status).toBe(201);
    expect((created.body['items'] as Array<{ id: string; visible: boolean }>).map((i) => i.visible)).toEqual([false, true, true]);
    const res = await site(`/api/v1/history/collections/${COLLECTION}?lang=ru`);
    const body = res.json() as { itemCount: number; documents: Array<{ id: string }> };
    expect(body.itemCount).toBe(2);
    expect(body.documents.map((d) => d.id)).toEqual([open]);
    expect(res.body).not.toContain(closed);
    expect(await t.db.auditLog.findFirst({ where: { entityType: 'collection', entityId: String(created.body['id']), action: 'create' } })).not.toBeNull();
  });
});
