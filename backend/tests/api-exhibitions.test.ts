import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idOf, testApp } from './helpers.ts';

/** ЭТАП 8. Онлайн-выставки (ТЗ §5.7, с. 9; F-090–F-092). */
let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp();
});
afterAll(() => t.close());

type Item = Record<string, unknown>;

describe('список выставок (F-090)', () => {
  it('показывает опубликованные выставки с признаком demo, тематиками, числом экспонатов и обложкой', async () => {
    const res = await t.get('/api/v1/exhibitions?lang=ru');
    expect(res.status).toBe(200);
    expect(res.headers['content-language']).toBe('ru');
    const items = res.body.items ?? [];
    expect(items.map((e) => e['slug'])).toEqual(['demo-exhibition-example', 'demo-exhibition-culture']);
    expect(items[0]).toMatchObject({ dataOrigin: 'demo', itemCount: 4, coverItem: 1, yearFrom: 1946, yearTo: 1991 });
    expect(String(items[0]?.['title'])).not.toMatch(/\[Демо\]/);
    expect(items[0]?.['topics']).toEqual([{ slug: 'industry', name: 'История промышленных предприятий' }]);
    expect(res.body['topics']).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'industry', count: 1 }), expect.objectContaining({ slug: 'culture_art', count: 1 })]),
    );
  });

  it('фильтрует по тематике и по историческому периоду (пересечение годов)', async () => {
    const slugs = async (q: string) => ((await t.get(`/api/v1/exhibitions?${q}`)).body.items ?? []).map((e) => e['slug']);
    expect(await slugs('topic=culture_art')).toEqual(['demo-exhibition-culture']);
    expect(await slugs('period=1917-1940')).toEqual(['demo-exhibition-culture']);
    expect(await slugs('period=since-1991')).toEqual(['demo-exhibition-example']);
    expect(await slugs('period=1941-1945')).toEqual([]);
    expect(await slugs('topic=industry&period=1917-1940')).toEqual([]);
  });
});

describe('выставка и экспонаты (F-091, F-092)', () => {
  it('экспонаты идут по порядку с номерами 1…N; ссылка на открытый документ с шифром на языке страницы', async () => {
    const res = await t.get('/api/v1/exhibitions/demo-exhibition-example?lang=kk');
    expect(res.status).toBe(200);
    const items = res.body['items'] as Item[];
    expect(items.map((i) => i['number'])).toEqual([1, 2, 3, 4]);
    expect(items[0]).toMatchObject({ title: 'Суреті бар экспонат', image: { alt: 'Экспонат суреті', width: 1600, height: 1000 } });
    expect(items[1]?.['document']).toMatchObject({ access: 'open', code: { formatted: 'Қ. TEST-1. Тізб. 1. Іс 1.' } });
    expect(items[2]?.['image']).toBeNull();
  });

  it('изображение экспоната отдаётся с запретом скриптов; у текстового экспоната и несуществующего номера — 404', async () => {
    const img = await t.app.inject({ method: 'GET', url: '/api/v1/exhibitions/demo-exhibition-example/items/1/image' });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/svg+xml');
    expect(img.headers['content-security-policy']).toContain('sandbox');
    expect(img.body).toContain('Экспонат 1');
    const scan = await t.app.inject({ method: 'GET', url: '/api/v1/exhibitions/demo-exhibition-example/items/2/image' });
    expect(scan.statusCode).toBe(200);
    for (const url of ['/items/3/image', '/items/9/image', '/items/0/image', '/items/abc/image']) {
      expect((await t.app.inject({ method: 'GET', url: `/api/v1/exhibitions/demo-exhibition-example${url}` })).statusCode).toBe(404);
    }
    expect((await t.get('/api/v1/exhibitions/no-such-exhibition')).status).toBe(404);
    expect((await t.get('/api/v1/exhibitions/BAD%20SLUG')).status).toBe(404);
  });
});

describe('выставка не открывает закрытое (ТЗ §5.3, с. 6)', () => {
  it('черновик не виден; закрытый документ, скан ограниченного документа и непроверенный файл не попадают на сайт', async () => {
    const restrictedDoc = await idOf(t.db, 'documents', 'TEST-1/1/1/2');
    const closedDoc = await idOf(t.db, 'documents', 'TEST-1/1/1/3');
    const closedFond = await idOf(t.db, 'fonds', 'TEST-3');
    const restrictedPage = await t.db.documentAsset.findFirstOrThrow({ where: { documentId: restrictedDoc }, select: { assetId: true } });
    const closedTitle = (await t.db.documentTranslation.findFirstOrThrow({ where: { documentId: closedDoc, locale: 'ru' } })).title;
    const pending = await t.db.digitalAsset.create({
      data: {
        kind: 'image', storageBucket: 'archive-test', storageKey: `pending-${Date.now()}.png`, originalFilename: 'x.png', mimeType: 'image/png',
        sizeBytes: 1n, sha256: 'x', accessLevel: 'open', processingStatus: 'ready', antivirusStatus: 'pending', dataOrigin: 'synthetic',
      },
    });
    const make = (slug: string, status: 'published' | 'draft') =>
      t.db.exhibition.create({
        data: {
          slug, publicationStatus: status, dataOrigin: 'synthetic',
          translations: { create: { locale: 'ru', title: slug, translationStatus: 'reviewed' } },
          items: {
            create: [
              { sortOrder: 1, assetId: restrictedPage.assetId, documentId: restrictedDoc, translations: { create: { locale: 'ru', title: 'скан ограниченного', translationStatus: 'reviewed' } } },
              { sortOrder: 2, documentId: closedDoc, fondId: closedFond, translations: { create: { locale: 'ru', title: 'закрытый', translationStatus: 'reviewed' } } },
              { sortOrder: 3, assetId: pending.id, translations: { create: { locale: 'ru', title: 'без антивируса', translationStatus: 'reviewed' } } },
            ],
          },
        },
      });
    const published = await make('test-leak-published', 'published');
    const draft = await make('test-leak-draft', 'draft');
    try {
      expect((await t.get('/api/v1/exhibitions/test-leak-draft')).status).toBe(404);
      expect((await t.app.inject({ method: 'GET', url: '/api/v1/exhibitions/test-leak-draft/items/2/image' })).statusCode).toBe(404);
      const list = await t.get('/api/v1/exhibitions?pageSize=50');
      expect((list.body.items ?? []).map((e) => e['slug'])).not.toContain('test-leak-draft');

      const res = await t.get('/api/v1/exhibitions/test-leak-published?lang=ru');
      expect(res.status).toBe(200);
      const items = res.body['items'] as Item[];
      // Ограниченный документ: карточка-ссылка допустима, скан — нет.
      expect(items[0]?.['image']).toBeNull();
      expect(items[0]?.['document']).toMatchObject({ id: restrictedDoc, access: 'restricted' });
      // Закрытый документ и закрытый фонд: ни ссылки, ни названия.
      expect(items[1]?.['document']).toBeNull();
      expect(items[1]?.['fond']).toBeNull();
      expect(res.raw).not.toContain(closedDoc);
      expect(res.raw).not.toContain(closedTitle);
      expect(res.raw).not.toContain(closedFond);
      // Файл без проверки антивирусом не показывается.
      expect(items[2]?.['image']).toBeNull();
      for (const n of [1, 2, 3]) {
        expect((await t.app.inject({ method: 'GET', url: `/api/v1/exhibitions/test-leak-published/items/${n}/image` })).statusCode).toBe(404);
      }
    } finally {
      await t.db.exhibition.deleteMany({ where: { id: { in: [published.id, draft.id] } } });
      await t.db.digitalAsset.delete({ where: { id: pending.id } });
    }
  });
});
