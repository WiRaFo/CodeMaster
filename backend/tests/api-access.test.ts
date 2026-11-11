import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idOf, testApp } from './helpers.ts';

/**
 * Серверная проверка доступа в публичном API (ТЗ §5.3, с. 6; §7.3; docs/api-design.md §1).
 * Закрытые и неопубликованные записи не раскрываются ни карточкой, ни поиском, ни шифром, ни навигацией;
 * ответ для них не отличается от ответа на несуществующий id.
 */

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp();
});
afterAll(() => t.close());

const PUBLIC_DOCS = ['TEST-1/1/1/1', 'TEST-1/1/1/2', 'TEST-1/1/1/5', 'TEST-2/1/1/1'];
const HIDDEN_DOCS = ['TEST-1/1/1/3', 'TEST-1/1/1/4', 'TEST-1/1/2/1', 'TEST-1/1/3/1', 'TEST-3/1/1/1', 'TEST-4/1/1/1'];

async function ids(keys: string[]) {
  return Promise.all(keys.map((k) => idOf(t.db, 'documents', k)));
}

describe('скрытые документы', () => {
  it('карточка и страницы закрытых и неопубликованных документов отвечают так же, как несуществующий id', async () => {
    const missing = await t.get('/api/v1/catalog/documents/00000000-0000-4000-8000-000000000000');
    const malformed = await t.get('/api/v1/catalog/documents/not-a-uuid');
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    for (const id of await ids(HIDDEN_DOCS)) {
      for (const url of [`/api/v1/catalog/documents/${id}`, `/api/v1/catalog/documents/${id}/pages`]) {
        const res = await t.get(url);
        expect(res.status, url).toBe(404);
        expect(Object.keys(res.body)).toEqual(['error']);
        expect((res.body['error'] as { code: string }).code).toBe('NOT_FOUND');
        expect(res.headers['cache-control']).toBe('no-store');
      }
    }
  });

  it('полная выдача каталога на каждом языке содержит только публичные документы', async () => {
    const expected = new Set(await ids(PUBLIC_DOCS));
    for (const lang of ['kk', 'ru', 'en']) {
      const res = await t.get(`/api/v1/catalog/documents?pageSize=100&lang=${lang}`);
      const synthetic = (res.body.items ?? []).filter((d) => d['dataOrigin'] === 'synthetic').map((d) => d['id']);
      expect(new Set(synthetic)).toEqual(expected);
    }
  });

  it('поиск по словам, неточный поиск и шифр не находят закрытые документы', async () => {
    const hidden = new Set(await ids(HIDDEN_DOCS));
    for (const q of ['переписка', 'Закрытый документ', 'Закрытй докуент', 'неопубликованном', 'correspondence', 'хат алмасу']) {
      const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent(q)}&pageSize=100`);
      expect(res.status).toBe(200);
      for (const d of res.body.items ?? []) expect(hidden.has(d['id'] as string), q).toBe(false);
    }
    for (const q of ['Ф. TEST-3', 'Ф. TEST-1. Оп. 1. Д. 2', 'Ф. TEST-1. Оп. 1. Д. 3', 'Ф. TEST-4']) {
      const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent(q)}`);
      expect(res.body['total'], q).toBe(0);
      expect(res.body['interpretedCode'], q).not.toBeNull();
    }
    const byParams = await t.get('/api/v1/catalog/documents?fond=TEST-3&inventory=1&case=1');
    expect(byParams.body['total']).toBe(0);
  });

  it('счётчики фасетов не учитывают скрытые документы', async () => {
    const res = await t.get('/api/v1/catalog/facets?fond=TEST-1');
    const access = res.body['access'] as Array<{ value: string; count: number }>;
    expect(Object.fromEntries(access.map((a) => [a.value, a.count]))).toEqual({ open: 2, restricted: 1 });
  });

  it('документ исчезает из API сразу после закрытия и возвращается после открытия', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    await t.db.document.update({ where: { id }, data: { accessLevel: 'closed' } });
    try {
      expect((await t.get(`/api/v1/catalog/documents/${id}`)).status).toBe(404);
      expect((await t.get(`/api/v1/catalog/documents/${id}/pages`)).status).toBe(404);
      const search = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent('сепаратора')}`);
      expect(search.body['total']).toBe(0);
    } finally {
      await t.db.document.update({ where: { id }, data: { accessLevel: 'open' } });
    }
    expect((await t.get(`/api/v1/catalog/documents/${id}`)).status).toBe(200);
  });
});

describe('ограниченный доступ', () => {
  const RESTRICTED_KEYS = [
    'id', 'title', 'description', 'historicalNote', 'contentLang', 'translationStatus', 'availableLanguages',
    'archiveCode', 'documentNumber', 'date', 'period', 'type', 'originalLanguages', 'sheetCount', 'author',
    'organization', 'storage', 'hierarchy', 'settlements', 'topics', 'dataOrigin', 'sourceNote', 'updatedAt',
    'access', 'accessConditions', 'digitalCopy',
  ].sort();

  it('карточка содержит только разрешённые поля и условия доступа', async () => {
    for (const key of ['TEST-1/1/1/2', 'TEST-2/1/1/1']) {
      const res = await t.get(`/api/v1/catalog/documents/${await idOf(t.db, 'documents', key)}?lang=ru`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(RESTRICTED_KEYS);
      expect(res.body['access']).toBe('restricted');
      expect(res.body['accessConditions']).toMatch(/читальном зале/);
      expect(res.body['digitalCopy']).toEqual({ availableOnline: false });
    }
  });

  it('расшифровка ограниченного документа не отдаётся и не участвует в поиске', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/2');
    for (const lang of ['ru', 'kk', 'en']) {
      const res = await t.get(`/api/v1/catalog/documents/${id}?lang=${lang}`);
      expect(res.raw).not.toMatch(/Ведомость|ведомосі|Payroll/);
    }
    for (const q of ['ведомость', 'заработной платы', 'payroll ledger', 'жалақы']) {
      const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent(q)}`);
      expect(res.body['total'], q).toBe(0);
    }
  });

  it('страницы копии ограниченного документа недоступны, хотя файл есть', async () => {
    for (const key of ['TEST-1/1/1/2', 'TEST-2/1/1/1']) {
      const res = await t.get(`/api/v1/catalog/documents/${await idOf(t.db, 'documents', key)}/pages`);
      expect(res.status).toBe(404);
    }
    const list = await t.get('/api/v1/catalog/documents?access=restricted&pageSize=100');
    for (const d of list.body.items ?? []) expect(d['hasDigitalCopy']).toBe(false);
  });
});

describe('открытый доступ', () => {
  it('карточка открытого документа отдаёт расшифровку и число страниц', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    const res = await t.get(`/api/v1/catalog/documents/${id}?lang=ru`);
    expect(res.body['access']).toBe('open');
    expect(res.body['transcription']).toBe('Слушали: о ремонте сепаратора.');
    expect(res.body['digitalCopy']).toEqual({ availableOnline: true, pageCount: 3 });
    const pages = await t.get(`/api/v1/catalog/documents/${id}/pages?lang=ru`);
    expect(pages.body.items?.map((p) => p['pageNumber'])).toEqual([1, 2, 3]);
    expect(pages.body.items?.[0]).toMatchObject({ pageNumber: 1, sheetLabel: '1', mimeType: 'image/svg+xml', width: 1240, height: 1754 });
    expect(String(pages.body.items?.[0]?.['alt'])).toMatch(/^Страница 1 из 3/);
    const search = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent('сепаратора')}`);
    expect(search.body.items?.map((d) => d['id'])).toEqual([id]);
  });

  it('копия без завершённой антивирусной проверки не показывается', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/5');
    const card = await t.get(`/api/v1/catalog/documents/${id}`);
    expect(card.body['digitalCopy']).toEqual({ availableOnline: false, pageCount: 0 });
    const pages = await t.get(`/api/v1/catalog/documents/${id}/pages`);
    expect(pages.status).toBe(200);
    expect(pages.body.items).toEqual([]);
  });
});

describe('навигация фонд → опись → дело', () => {
  it('список фондов не содержит закрытых фондов и фондов неопубликованных подразделений', async () => {
    const res = await t.get('/api/v1/catalog/fonds?pageSize=100');
    const numbers = (res.body.items ?? []).map((f) => f['number']);
    expect(numbers).toEqual(expect.arrayContaining(['TEST-1', 'TEST-2']));
    expect(numbers).not.toContain('TEST-3');
    expect(numbers).not.toContain('TEST-4');
  });

  it('фильтр по виду фонда: личные фонды отдельно (дополнение к ТЗ §2); неверный вид — 400', async () => {
    const personal = await t.get('/api/v1/catalog/fonds?kind=personal&pageSize=100');
    const items = (personal.body.items ?? []) as Array<Record<string, unknown>>;
    expect(items.map((f) => f['number'])).toContain('TEST-5');
    expect(items.every((f) => f['kind'] === 'personal')).toBe(true);
    const orgs = await t.get('/api/v1/catalog/fonds?kind=organization&pageSize=100');
    expect(((orgs.body.items ?? []) as Array<Record<string, unknown>>).map((f) => f['number'])).not.toContain('TEST-5');
    expect((await t.get('/api/v1/catalog/fonds?kind=secret')).status).toBe(400);
  });

  it('закрытые и неопубликованные уровни отвечают 404 и не попадают в списки', async () => {
    const hiddenUrls = [
      `/api/v1/catalog/fonds/${await idOf(t.db, 'fonds', 'TEST-3')}`,
      `/api/v1/catalog/fonds/${await idOf(t.db, 'fonds', 'TEST-4')}`,
      `/api/v1/catalog/inventories/${await idOf(t.db, 'inventories', 'TEST-3/1')}`,
      `/api/v1/catalog/cases/${await idOf(t.db, 'cases', 'TEST-1/1/2')}`,
      `/api/v1/catalog/cases/${await idOf(t.db, 'cases', 'TEST-1/1/3')}`,
      `/api/v1/catalog/cases/${await idOf(t.db, 'cases', 'TEST-3/1/1')}`,
    ];
    for (const url of hiddenUrls) expect((await t.get(url)).status, url).toBe(404);

    const inventory = await t.get(`/api/v1/catalog/inventories/${await idOf(t.db, 'inventories', 'TEST-1/1')}`);
    expect((inventory.body['cases'] as Array<{ number: string }>).map((c) => c.number)).toEqual(['1']);

    const kase = await t.get(`/api/v1/catalog/cases/${await idOf(t.db, 'cases', 'TEST-1/1/1')}`);
    expect((kase.body['documents'] as Array<{ documentNumber: string }>).map((d) => d.documentNumber)).toEqual(['1', '2', '5']);
  });

  it('разбор шифра находит только публичные уровни', async () => {
    const open = await t.get(`/api/v1/catalog/resolve-code?code=${encodeURIComponent('ф test-1 оп 1 д 1')}&lang=ru`);
    expect(open.body['matches']).toEqual([expect.objectContaining({ level: 'case', id: await idOf(t.db, 'cases', 'TEST-1/1/1') })]);
    for (const code of ['Ф. TEST-3', 'Ф. TEST-4. Оп. 1', 'Ф. TEST-1. Оп. 1. Д. 2', 'Ф. TEST-1. Оп. 1. Д. 3']) {
      const res = await t.get(`/api/v1/catalog/resolve-code?code=${encodeURIComponent(code)}`);
      expect(res.body['matches'], code).toEqual([]);
    }
  });
});

describe('изображения страниц (ЭТАП 6, F-041)', () => {
  const image = (id: string, page: number | string) => `/api/v1/catalog/documents/${id}/pages/${page}/image`;

  it('страница открытого документа отдаётся с безопасными заголовками', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    const res = await t.app.inject({ method: 'GET', url: image(id, 2) });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/svg+xml');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(String(res.headers['content-security-policy'])).toContain('sandbox');
    expect(res.body).toContain('Протокол заседания');
    expect(res.body).toContain('— 2 / 3 —');
    expect(res.body).not.toMatch(/<script/i);
  });

  it('страницы ограниченных, закрытых, неопубликованных документов и непроверенные файлы — тот же 404', async () => {
    const missing = await t.app.inject({ method: 'GET', url: image('00000000-0000-4000-8000-000000000000', 1) });
    expect(missing.statusCode).toBe(404);
    // TEST-1/1/1/2 — restricted с файлом в хранилище; TEST-2 — restricted по фонду; TEST-1/1/1/5 — антивирус не завершён.
    for (const key of ['TEST-1/1/1/2', 'TEST-2/1/1/1', 'TEST-1/1/1/5', 'TEST-1/1/1/3', 'TEST-1/1/1/4']) {
      const res = await t.app.inject({ method: 'GET', url: image(await idOf(t.db, 'documents', key), 1) });
      expect(res.statusCode, key).toBe(404);
      expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND', message: missing.json().error.message } });
    }
  });

  it('несуществующая страница, неверный номер и неверный id — 404', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    for (const url of [image(id, 4), image(id, 0), image(id, 'abc'), image(id, '1.5'), image('not-a-uuid', 1)]) {
      expect((await t.app.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
  });

  it('страница скрывается сразу после ограничения документа', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    try {
      await t.db.document.update({ where: { id }, data: { accessLevel: 'restricted' } });
      expect((await t.app.inject({ method: 'GET', url: image(id, 1) })).statusCode).toBe(404);
    } finally {
      await t.db.document.update({ where: { id }, data: { accessLevel: 'open' } });
    }
    expect((await t.app.inject({ method: 'GET', url: image(id, 1) })).statusCode).toBe(200);
  });
});
