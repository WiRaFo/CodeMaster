import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toSafeHighlight, HL_START, HL_STOP } from '../src/http/highlight.ts';
import { idOf, testApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp();
});
afterAll(() => t.close());

const docs = (body: { items?: Array<Record<string, unknown>> }) =>
  (body.items ?? []).filter((d) => d['dataOrigin'] === 'synthetic').map((d) => d['documentNumber']);

describe('поиск по каталогу (ТЗ §5.3, с. 5)', () => {
  it('находит по словоформе на русском и подсвечивает совпадение', async () => {
    const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent('маслозаводы')}&lang=ru`);
    expect(res.body['total']).toBe(3);
    expect(res.body.items?.[0]?.['highlight']).toContain('<mark>маслозавода</mark>');
  });

  it('находит по казахскому тексту', async () => {
    const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent('хаттамасы')}&lang=kk`);
    expect(docs(res.body)).toEqual(['1']);
    expect(res.body.items?.[0]?.['contentLang']).toBe('kk');
  });

  it('находит название с опечаткой (pg_trgm)', async () => {
    const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent('Фатография колектива')}`);
    expect(docs(res.body)).toContain('5');
  });

  it('распознаёт архивный шифр в строке поиска', async () => {
    const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent('ф. test-1 оп. 1 д. 1')}&sort=code&lang=en`);
    expect(res.body['interpretedCode']).toEqual({ fond: 'TEST-1', inventory: '1', case: '1', formatted: 'F. TEST-1. Inv. 1. File 1.' });
    expect(docs(res.body)).toEqual(['1', '2', '5']);
  });

  it('фильтрует по году, типу, наличию копии и уровню доступа', async () => {
    expect(docs((await t.get('/api/v1/catalog/documents?yearFrom=1957&yearTo=1957')).body)).toEqual(['2']);
    expect(docs((await t.get('/api/v1/catalog/documents?type=photo')).body)).toEqual(['5']);
    expect(docs((await t.get('/api/v1/catalog/documents?hasDigitalCopy=true')).body)).toEqual(['1']);
    const restricted = await t.get('/api/v1/catalog/documents?access=restricted&sort=date_asc');
    expect(docs(restricted.body)).toEqual(['2', '1']);
    const both = await t.get('/api/v1/catalog/documents?type=photo,organization_record&branch=main&sort=date_asc');
    expect(docs(both.body)).toEqual(['1', '5']);
  });

  it('сортирует по дате и разбивает на страницы', async () => {
    const res = await t.get('/api/v1/catalog/documents?fond=TEST-1&sort=date_desc&pageSize=1&page=2');
    expect(res.body).toMatchObject({ page: 2, pageSize: 1, total: 3, totalPages: 3 });
    expect(docs(res.body)).toEqual(['2']);
  });

  it('безопасно обрабатывает спецсимволы в запросе', async () => {
    for (const q of ["'; DROP TABLE documents; --", '%_\\', '<script>alert(1)</script>', '& | ! :*']) {
      const res = await t.get(`/api/v1/catalog/documents?q=${encodeURIComponent(q)}`);
      expect(res.status, q).toBe(200);
    }
    expect((await t.get('/api/v1/catalog/documents?author=%25')).body['total']).toBe(0);
  });

  it('отклоняет неверные параметры с кодом VALIDATION_FAILED', async () => {
    for (const qs of ['pageSize=1000', 'yearFrom=1960&yearTo=1950', 'access=closed', 'sort=random', 'hasDigitalCopy=yes', 'page=0']) {
      const res = await t.get(`/api/v1/catalog/documents?${qs}`);
      expect(res.status, qs).toBe(400);
      expect((res.body['error'] as { code: string }).code).toBe('VALIDATION_FAILED');
    }
    const longQ = await t.get(`/api/v1/catalog/documents?q=${'а'.repeat(201)}`);
    expect(longQ.status).toBe(400);
  });
});

describe('язык ответа', () => {
  it('по умолчанию казахский, Accept-Language учитывается, lang важнее заголовка', async () => {
    const id = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    const byDefault = await t.get(`/api/v1/catalog/documents/${id}`);
    expect(byDefault.body['contentLang']).toBe('kk');
    expect(byDefault.headers['content-language']).toBe('kk');
    const byHeader = await t.get(`/api/v1/catalog/documents/${id}`, { 'accept-language': 'en-US,en;q=0.9,ru;q=0.8' });
    expect(byHeader.body['contentLang']).toBe('en');
    expect((byHeader.body['archiveCode'] as { formatted: string }).formatted).toBe('F. TEST-1. Inv. 1. File 1.');
    const byParam = await t.get(`/api/v1/catalog/documents/${id}?lang=ru`, { 'accept-language': 'en' });
    expect(byParam.body['contentLang']).toBe('ru');
    expect(byParam.body['translationStatus']).toBe('reviewed');
  });
});

describe('подсветка', () => {
  it('экранирует HTML и оставляет только <mark>', () => {
    expect(toSafeHighlight(`<b>x</b> ${HL_START}слово${HL_STOP} "a" & 'b'`)).toBe(
      "&lt;b&gt;x&lt;/b&gt; <mark>слово</mark> &quot;a&quot; &amp; &#39;b&#39;",
    );
    expect(toSafeHighlight('без совпадений')).toBeNull();
  });
});

describe('служебные маршруты', () => {
  it('health и ready', async () => {
    expect((await t.get('/health')).body).toEqual({ status: 'ok' });
    expect((await t.get('/ready')).body).toEqual({ status: 'ok', checks: { database: 'ok' } });
  });

  it('неизвестный маршрут отвечает NOT_FOUND в общем формате', async () => {
    const res = await t.get('/api/v1/unknown');
    expect(res.status).toBe(404);
    expect(res.body['error']).toMatchObject({ code: 'NOT_FOUND' });
  });
});
