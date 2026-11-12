import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idOf, testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** ЭТАП 7. Цифровая история, вопросы и ответы, отзывы (ТЗ §5.6, §4; F-080–F-084). */
let t: Awaited<ReturnType<typeof testApp>>;
let moderator: Client;
let archivist: Client;
beforeAll(async () => {
  t = await testApp();
  moderator = await login(t.app, (await createStaff(t.db, 'moderator')).email, undefined, '10.0.7.1');
  archivist = await login(t.app, (await createStaff(t.db, 'archivist')).email, undefined, '10.0.7.2');
});
afterAll(async () => {
  await t.db.feedbackMessage.deleteMany({ where: { message: { startsWith: '[тест]' } } });
  await cleanupStaff(t.db);
  await t.close();
});

describe('цифровая история региона (F-080–F-082)', () => {
  it('список: только опубликованные, все 11 тематик ТЗ с числом публикаций, фильтр по тематике', async () => {
    const res = await t.get('/api/v1/history?lang=ru');
    expect(res.status).toBe(200);
    expect((res.body.items ?? []).map((p) => p['slug']).sort()).toEqual(['demo-how-to-read-archive-code', 'demo-reading-room-visit']);
    const topics = res.body['topics'] as Array<{ slug: string; count: number }>;
    expect(topics).toHaveLength(11);
    expect(topics.find((x) => x.slug === 'family')?.count).toBe(1);
    const family = await t.get('/api/v1/history?topic=family');
    expect((family.body.items ?? []).map((p) => p['slug'])).toEqual(['demo-reading-room-visit']);
    expect((await t.get('/api/v1/history?topic=military')).body['total']).toBe(0);
  });

  it('черновик и снятая публикация — 404 так же, как несуществующая', async () => {
    const slug = 'demo-reading-room-visit';
    await t.db.publication.update({ where: { slug }, data: { publicationStatus: 'draft' } });
    try {
      expect((await t.get(`/api/v1/history/${slug}`)).status).toBe(404);
      expect((await t.get('/api/v1/history?topic=family')).body['total']).toBe(0);
    } finally {
      await t.db.publication.update({ where: { slug }, data: { publicationStatus: 'published' } });
    }
    expect((await t.get('/api/v1/history/no-such-story')).status).toBe(404);
  });

  it('связанный документ: открытый показывается с шифром, закрытый не раскрывается ни id, ни названием (F-084)', async () => {
    const slug = 'demo-how-to-read-archive-code';
    const open = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    const closed = await idOf(t.db, 'documents', 'TEST-1/1/1/3');
    try {
      await t.db.publication.update({ where: { slug }, data: { documentId: open } });
      const shown = await t.get(`/api/v1/history/${slug}?lang=ru`);
      expect(shown.body['document']).toMatchObject({ id: open, access: 'open', code: { formatted: 'Ф. TEST-1. Оп. 1. Д. 1.' } });
      await t.db.publication.update({ where: { slug }, data: { documentId: closed } });
      const hidden = await t.get(`/api/v1/history/${slug}?lang=ru`);
      expect(hidden.body['document']).toBeNull();
      expect(hidden.raw).not.toContain(closed);
      expect(hidden.body).toMatchObject({ sourceNote: expect.stringContaining('Демонстрационный'), bodyText: expect.stringContaining('Ф. 12') });
    } finally {
      await t.db.publication.update({ where: { slug }, data: { documentId: null } });
    }
  });
});

describe('вопросы и ответы', () => {
  it('шесть демо-вопросов о работе сайта на трёх языках', async () => {
    for (const lang of ['kk', 'ru', 'en']) {
      const res = await t.get(`/api/v1/faq?lang=${lang}`);
      expect(res.body.items).toHaveLength(6);
      expect(res.body.items?.[0]).toMatchObject({ dataOrigin: 'demo', contentLang: lang });
    }
  });
});

describe('отзывы и предложения', () => {
  const send = (body: Record<string, unknown>, ip: string, headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'POST', url: '/api/v1/feedback', payload: { topic: 'site', lang: 'ru', ...body }, remoteAddress: ip, headers });

  it('отзыв сохраняется без IP; почта — только с согласием; бот-ловушка не сохраняет; чужой сайт — 403', async () => {
    const ok = await send({ message: '[тест] Не нашёл фильтр по годам', pagePath: '/ru/catalog' }, '10.7.0.1');
    expect(ok.statusCode).toBe(202);
    const row = await t.db.feedbackMessage.findFirst({ where: { message: '[тест] Не нашёл фильтр по годам' } });
    expect(row).toMatchObject({ topic: 'site', locale: 'ru', pagePath: '/ru/catalog', contactEmail: null, status: 'new' });
    expect(Object.keys(row ?? {})).not.toContain('ip');

    expect((await send({ message: '[тест] С почтой без согласия', contactEmail: 'a@example.kz' }, '10.7.0.2')).statusCode).toBe(400);
    expect((await send({ message: '[тест] С почтой и согласием', contactEmail: 'a@example.kz', consent: true }, '10.7.0.2')).statusCode).toBe(202);
    expect((await send({ message: 'коротко' }, '10.7.0.2')).statusCode).toBe(400);
    expect((await send({ message: '[тест] Бот заполнил ловушку', website: 'http://spam' }, '10.7.0.3')).statusCode).toBe(202);
    expect(await t.db.feedbackMessage.count({ where: { message: '[тест] Бот заполнил ловушку' } })).toBe(0);
    expect((await send({ message: '[тест] С чужого сайта' }, '10.7.0.4', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
  });

  it('не больше 5 отзывов за 10 минут с одного адреса', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await send({ message: `[тест] Поток ${i} сообщений` }, '10.7.0.9')).statusCode);
    expect(codes).toEqual([202, 202, 202, 202, 202, 429]);
  });

  it('в панели отзывы видит роль с feedback:read; смена статуса пишется в журнал', async () => {
    expect((await archivist.request('GET', '/api/v1/admin/feedback')).status).toBe(403);
    const list = await moderator.request('GET', '/api/v1/admin/feedback');
    expect(list.status).toBe(200);
    const item = (list.body['items'] as Array<{ id: string; message: string }>).find((x) => x.message === '[тест] Не нашёл фильтр по годам');
    expect(item).toBeDefined();
    expect((await moderator.request('POST', `/api/v1/admin/feedback/${item?.id}/status`, { status: 'archived' })).status).toBe(200);
    expect(((await moderator.request('GET', '/api/v1/admin/feedback')).body['items'] as Array<{ id: string }>).some((x) => x.id === item?.id)).toBe(false);
    const audit = await t.db.auditLog.findFirst({ where: { entityType: 'feedback', entityId: item?.id } });
    expect(audit).toMatchObject({ action: 'status_change' });
  });
});
