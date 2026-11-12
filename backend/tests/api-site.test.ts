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

  it('фильтр по населённому пункту (F-084): список только с публикациями, сочетается с направлением', async () => {
    const res = await t.get('/api/v1/history?lang=ru');
    expect(res.body['settlements']).toEqual([{ slug: 'ust-kamenogorsk', name: 'Усть-Каменогорск', count: 1 }]);
    const uk = await t.get('/api/v1/history?settlement=ust-kamenogorsk');
    expect((uk.body.items ?? []).map((p) => p['slug'])).toEqual(['demo-reading-room-visit']);
    expect((await t.get('/api/v1/history?settlement=ust-kamenogorsk&topic=region')).body['total']).toBe(0);
    expect((await t.get('/api/v1/history?settlement=ridder')).body['total']).toBe(0);
    // Снятая публикация не попадает и в список населённых пунктов.
    await t.db.publication.update({ where: { slug: 'demo-reading-room-visit' }, data: { publicationStatus: 'archived' } });
    try {
      expect((await t.get('/api/v1/history')).body['settlements']).toEqual([]);
    } finally {
      await t.db.publication.update({ where: { slug: 'demo-reading-room-visit' }, data: { publicationStatus: 'published' } });
    }
  });

  it('хронология (F-083): события архива по годам из переданного текста, снятое событие не видно', async () => {
    const res = await t.get('/api/v1/history/timeline?lang=kk');
    const items = res.body['items'] as Array<{ slug: string; year: number; date: string | null; title: string; description: string; contentLang: string; dataOrigin: string }>;
    expect(items.length).toBe(12);
    expect(items.map((e) => e.year)).toEqual([...items.map((e) => e.year)].sort((a, b) => a - b));
    expect(items[0]).toMatchObject({ slug: 'archive-founded-1940', year: 1940, date: null, contentLang: 'ru', dataOrigin: 'verified' });
    expect(items[0]?.description).toContain('образован в 1940 году');
    expect(items.find((e) => e.slug === 'archives-administration-1992')?.date).toBe('1992-08-13');
    expect(items.find((e) => e.slug === 'network-formed-1967')?.description).toContain('— Государственного архива Восточно-Казахстанской области');
    await t.db.historicalEvent.update({ where: { slug: 'abai-region-2022' }, data: { publicationStatus: 'draft' } });
    try {
      const after = (await t.get('/api/v1/history/timeline')).body['items'] as Array<{ slug: string }>;
      expect(after.map((e) => e.slug)).not.toContain('abai-region-2022');
    } finally {
      await t.db.historicalEvent.update({ where: { slug: 'abai-region-2022' }, data: { publicationStatus: 'published' } });
    }
  });

  it('личности (F-086): список, страница с записями календаря, снятая личность — 404', async () => {
    const list = await t.get('/api/v1/history/persons?lang=ru');
    const items = list.body['items'] as Array<{ slug: string; fullName: string; lifeYears: string | null }>;
    expect(items).toHaveLength(8);
    expect(items.find((p) => p.slug === 'burov-pavel')).toMatchObject({ fullName: 'Буров Павел Петрович', lifeYears: '1902–1944' });
    const kk = await t.get('/api/v1/history/persons/auezov-mukhtar?lang=kk');
    expect(kk.body).toMatchObject({ fullName: 'Мұхтар Омарханұлы Әуезов', contentLang: 'kk', biography: null });
    expect(kk.body['memorableDates']).toEqual([
      { calendarYear: 2022, dateLabel: '28 қыркүйек', text: expect.stringContaining('Абай жолы'), contentLang: 'kk' },
    ]);
    const pankratyev = await t.get('/api/v1/history/persons/pankratyev-dmitry?lang=ru');
    expect((pankratyev.body['memorableDates'] as unknown[]).length).toBe(2);
    await t.db.historicalPerson.update({ where: { slug: 'burov-pavel' }, data: { publicationStatus: 'draft' } });
    try {
      expect((await t.get('/api/v1/history/persons/burov-pavel')).status).toBe(404);
      expect(((await t.get('/api/v1/history/persons')).body['items'] as Array<{ slug: string }>).map((p) => p.slug)).not.toContain('burov-pavel');
    } finally {
      await t.db.historicalPerson.update({ where: { slug: 'burov-pavel' }, data: { publicationStatus: 'published' } });
    }
    expect((await t.get('/api/v1/history/persons/no-such-person')).status).toBe(404);
  });

  it('коллекции (F-081): только публичные элементы, закрытый документ не виден ни в составе, ни в счётчике', async () => {
    const list = await t.get('/api/v1/history/collections?lang=ru');
    const items = list.body['items'] as Array<{ slug: string; title: string; itemCount: number; dataOrigin: string }>;
    expect(items.map((c) => [c.slug, c.itemCount])).toEqual([['demo-creamery-records', 3], ['demo-local-historians', 3]]);
    expect(items[0]).toMatchObject({ title: '[Демо] Маслозавод в документах', dataOrigin: 'demo' });
    const closed = await idOf(t.db, 'documents', 'TEST-1/1/1/3');
    const res = await t.get('/api/v1/history/collections/demo-creamery-records?lang=ru');
    const docs = res.body['documents'] as Array<{ id: string; access: string }>;
    expect(docs).toHaveLength(3);
    expect(docs.map((d) => d.access)).toEqual(['open', 'restricted', 'open']);
    expect(res.raw).not.toContain(closed);
    expect(res.raw).not.toContain('Закрытый документ');
    const people = await t.get('/api/v1/history/collections/demo-local-historians?lang=kk');
    expect((people.body['persons'] as Array<{ slug: string; fullName: string }>).map((p) => p.slug)).toEqual(['pankratyev-dmitry', 'gerasimov-boris', 'kharlamov-prokofy']);
    // Снятая коллекция — 404, как несуществующая.
    await t.db.collection.update({ where: { slug: 'demo-local-historians' }, data: { publicationStatus: 'archived' } });
    try {
      expect((await t.get('/api/v1/history/collections/demo-local-historians')).status).toBe(404);
    } finally {
      await t.db.collection.update({ where: { slug: 'demo-local-historians' }, data: { publicationStatus: 'published' } });
    }
    expect((await t.get('/api/v1/history/collections/nothing')).status).toBe(404);
  });

  it('галерея (F-085): только открытые документы с проверенной копией, ссылка на изображение работает', async () => {
    const open = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    const res = await t.get('/api/v1/history/gallery?lang=ru');
    const items = res.body.items as Array<{ id: string; access: string; image: { url: string } }>;
    // Ограниченный TEST-1/1/1/2 (копия не публикуется) и фото TEST-1/1/1/5 (антивирус не проверил) в галерею не попадают.
    expect(items.map((i) => i.id)).toContain(open);
    expect(items.every((i) => i.access === 'open')).toBe(true);
    for (const key of ['TEST-1/1/1/2', 'TEST-1/1/1/3', 'TEST-1/1/1/5']) expect(res.raw).not.toContain(await idOf(t.db, 'documents', key));
    const first = items.find((i) => i.id === open);
    expect(first?.image.url).toBe(`/api/v1/catalog/documents/${open}/pages/1/image`);
    expect((await t.app.inject({ method: 'GET', url: first?.image.url ?? '' })).statusCode).toBe(200);
    expect(res.body['total']).toBe(items.length);
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
