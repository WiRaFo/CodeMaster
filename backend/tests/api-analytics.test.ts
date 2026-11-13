import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maskQuery, sectionOf } from '../src/modules/analytics/analytics.ts';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/**
 * Аналитика сайта без персональных данных (ТЗ §5.8 Д, с. 11; F-126, F-127) и база знаний помощника (§5.8 А).
 * Проверяется: счётчики просмотров и ошибок, отказ от учёта по DNT, маскирование запросов, права в панели,
 * ответ помощника по записи базы знаний.
 */
let t: Awaited<ReturnType<typeof testApp>>;
let analyst: Client;
let editor: Client;
let archivist: Client;

beforeAll(async () => {
  t = await testApp();
  analyst = await login(t.app, (await createStaff(t.db, 'analyst')).email);
  editor = await login(t.app, (await createStaff(t.db, 'editor')).email);
  archivist = await login(t.app, (await createStaff(t.db, 'archivist')).email);
});
afterAll(async () => {
  await t.db.assistantKnowledge.deleteMany({ where: { createdBy: { email: { startsWith: 'test-staff-' } } } });
  await cleanupStaff(t.db);
  await t.close();
});

const post = (url: string, payload: Record<string, unknown>, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'POST', url: `/api/v1${url}`, payload, headers });
const ask = (q: string, ip: string) =>
  t.app.inject({ method: 'GET', url: `/api/v1/assistant/ask?${new URLSearchParams({ q, lang: 'ru' }).toString()}`, remoteAddress: ip });

describe('разбор адреса и маскирование', () => {
  it('раздел и язык берутся из адреса; неизвестное — «other», без языка — не считается', () => {
    expect(sectionOf('/ru')).toEqual({ section: 'home', locale: 'ru' });
    expect(sectionOf('/kk/catalog/documents/123?x=1')).toEqual({ section: 'catalog/documents', locale: 'kk' });
    expect(sectionOf('/en/history/timeline#e')).toEqual({ section: 'history/timeline', locale: 'en' });
    expect(sectionOf('/ru/something-else')).toEqual({ section: 'other', locale: 'ru' });
    expect(sectionOf('/admin/analytics')).toBeNull();
  });

  it('почта и длинные числа заменяются, обычные годы остаются', () => {
    expect(maskQuery('справка ivanov@example.kz  тел +7 (705) 123-45-67')).toBe('справка [email] тел [number]');
    expect(maskQuery('маслозавод 1956 год')).toBe('маслозавод 1956 год');
  });
});

describe('счётчики сайта', () => {
  it('просмотр увеличивает счётчик раздела; с DNT или Sec-GPC не считается; чужой сайт отклоняется', async () => {
    const views = async () => (await t.db.analyticsPageView.findMany({ where: { section: 'reading-room', locale: 'en' } })).reduce((n, v) => n + v.views, 0);
    const before = await views();
    expect((await post('/analytics/view', { path: '/en/reading-room' })).statusCode).toBe(204);
    expect((await post('/analytics/view', { path: '/en/reading-room' })).statusCode).toBe(204);
    expect(await views()).toBe(before + 2);
    expect((await post('/analytics/view', { path: '/en/reading-room' }, { dnt: '1' })).statusCode).toBe(204);
    expect((await post('/analytics/view', { path: '/en/reading-room' }, { 'sec-gpc': '1' })).statusCode).toBe(204);
    expect(await views()).toBe(before + 2);
    expect((await post('/analytics/view', { path: '/en/reading-room' }, { 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
    expect((await post('/analytics/view', {})).statusCode).toBe(400);
  });

  it('ошибка записывается без параметров адреса', async () => {
    expect((await post('/analytics/error', { kind: 'not_found', path: '/ru/no-such-page?q=secret' })).statusCode).toBe(204);
    const rows = await t.db.analyticsError.findMany({ where: { kind: 'not_found', path: { startsWith: '/ru/no-such-page' } } });
    expect(rows.map((r) => r.path)).toEqual(['/ru/no-such-page']);
  });

  it('запрос каталога попадает в журнал замаскированным, без адреса посетителя', async () => {
    const res = await t.app.inject({ method: 'GET', url: `/api/v1/catalog/documents?${new URLSearchParams({ q: 'нетакогослова petrov@example.kz', lang: 'ru' }).toString()}`, remoteAddress: '10.44.0.7' });
    expect(res.statusCode).toBe(200);
    const row = await t.db.searchQuery.findFirst({ where: { queryText: { startsWith: 'нетакогослова' } }, orderBy: { occurredAt: 'desc' } });
    expect(row).toMatchObject({ queryText: 'нетакогослова [email]', source: 'catalog', resultCount: 0, locale: 'ru' });
    // В записи нет ничего о посетителе: только текст, язык, источник, число результатов, фильтры и время.
    expect(Object.keys(row ?? {}).sort()).toEqual(['filters', 'id', 'locale', 'occurredAt', 'queryText', 'resultCount', 'source']);
  });
});

describe('панель: аналитика', () => {
  it('отчёт доступен только с правом stats:read и содержит разделы, запросы без результата и ошибки', async () => {
    expect((await t.get('/api/v1/admin/analytics')).status).toBe(401);
    expect((await archivist.request('GET', '/api/v1/admin/analytics')).status).toBe(403);
    const res = await analyst.request('GET', '/api/v1/admin/analytics?days=7');
    expect(res.status).toBe(200);
    const body = res.body as { days: number; totalViews: number; bySection: Array<{ key: string; views: number }>; zeroQueries: Array<{ text: string }>; errors: Array<{ path: string }> };
    expect(body.days).toBe(7);
    expect(body.bySection.find((s) => s.key === 'reading-room')?.views).toBeGreaterThanOrEqual(2);
    expect(body.totalViews).toBeGreaterThanOrEqual(2);
    expect(body.zeroQueries.map((q) => q.text)).toContain('нетакогослова [email]');
    expect(body.errors.map((e) => e.path)).toContain('/ru/no-such-page');
    expect((await analyst.request('GET', '/api/v1/admin/analytics?days=1000')).status).toBe(400);
  });
});

describe('панель: база знаний помощника', () => {
  const entry = {
    published: true,
    links: ['visitors'],
    translations: { ru: { question: 'Можно ли прийти с ноутбуком?', keywords: ['с ноутбуком'], answer: 'Проверочный ответ базы знаний для теста.' } },
  };

  it('без права публикации запись не создаётся; аналитик не видит базу знаний', async () => {
    expect((await analyst.request('GET', '/api/v1/admin/assistant/knowledge')).status).toBe(403);
    expect((await archivist.request('POST', '/api/v1/admin/assistant/knowledge', entry)).status).toBe(403);
    expect((await editor.request('POST', '/api/v1/admin/assistant/knowledge', { ...entry, translations: {} })).status).toBe(400);
  });

  it('опубликованная запись отвечает на вопрос; черновик — нет; правка требует актуальной версии; удаление с подтверждением', async () => {
    const question = 'пустят ли меня с ноутбуком в зал';
    expect((await ask(question, '10.45.0.1')).json<{ intent: string }>().intent).not.toBe('knowledge');
    const unanswered = await editor.request('GET', '/api/v1/admin/assistant/unanswered');
    expect((unanswered.body['items'] as Array<{ text: string }>).map((i) => i.text)).toContain(question);

    const created = await editor.request('POST', '/api/v1/admin/assistant/knowledge', entry);
    expect(created.status).toBe(201);
    const id = created.body['id'] as string;
    const answer = (await ask(question, '10.45.0.2')).json<{ intent: string; knowledge: { answer: string } }>();
    expect(answer.intent).toBe('knowledge');
    expect(answer.knowledge.answer).toBe(entry.translations.ru.answer);

    expect((await editor.request('PUT', `/api/v1/admin/assistant/knowledge/${id}`, { ...entry, published: false }, { 'if-match': '2020-01-01T00:00:00.000Z' })).status).toBe(409);
    const saved = await editor.request('PUT', `/api/v1/admin/assistant/knowledge/${id}`, { ...entry, published: false }, { 'if-match': created.body['updatedAt'] as string });
    expect(saved.status).toBe(200);
    expect(saved.body['published']).toBe(false);
    expect((await ask(question, '10.45.0.3')).json<{ intent: string }>().intent).not.toBe('knowledge');

    const audit = await t.db.auditLog.findMany({ where: { entityType: 'assistant_knowledge', entityId: id } });
    expect(audit.map((a) => a.action).sort()).toEqual(['create', 'update']);

    expect((await editor.request('DELETE', `/api/v1/admin/assistant/knowledge/${id}`, {})).status).toBe(400);
    expect((await editor.request('DELETE', `/api/v1/admin/assistant/knowledge/${id}`, { confirm: true })).status).toBe(204);
    expect(await t.db.assistantKnowledge.count({ where: { id } })).toBe(0);
  });
});
