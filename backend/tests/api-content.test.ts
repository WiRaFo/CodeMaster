import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idOf, testApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp();
});
afterAll(() => t.close());

type Item = Record<string, unknown>;

describe('новости (ТЗ §5.11)', () => {
  it('лента по убыванию даты, демо-записи без пометок в заголовке, есть пагинация', async () => {
    const res = await t.get('/api/v1/news?lang=ru');
    expect(res.status).toBe(200);
    expect(res.headers['content-language']).toBe('ru');
    expect(res.body).toMatchObject({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    const items = res.body.items ?? [];
    expect(items.map((n) => n['slug'])).toEqual(['demo-new-site-prototype', 'demo-catalog-search']);
    for (const n of items) {
      expect(n['dataOrigin']).toBe('demo');
      expect(String(n['title'])).not.toMatch(/\[Демо\]/);
    }
    const second = await t.get('/api/v1/news?pageSize=1&page=2');
    expect(second.body.items?.map((n) => n['slug'])).toEqual(['demo-catalog-search']);
  });

  it('черновики, будущие и удалённые новости не видны ни в ленте, ни на главной, ни по прямой ссылке', async () => {
    const hidden = [
      { slug: 'test-hidden-draft', publicationStatus: 'draft' as const, publishedAt: new Date(), deletedAt: null },
      { slug: 'test-hidden-future', publicationStatus: 'published' as const, publishedAt: new Date(Date.now() + 86_400_000), deletedAt: null },
      { slug: 'test-hidden-deleted', publicationStatus: 'published' as const, publishedAt: new Date(), deletedAt: new Date() },
      { slug: 'test-hidden-in-review', publicationStatus: 'in_review' as const, publishedAt: new Date(), deletedAt: null },
    ];
    try {
      for (const h of hidden) {
        await t.db.news.create({
          data: { ...h, dataOrigin: 'synthetic', translations: { create: { locale: 'ru', title: h.slug, translationStatus: 'reviewed' } } },
        });
      }
      const list = await t.get('/api/v1/news?pageSize=50');
      const home = await t.get('/api/v1/home');
      const visible = [...(list.body.items ?? []), ...((home.body['news'] as Item[]) ?? [])].map((n) => n['slug']);
      for (const h of hidden) {
        expect(visible).not.toContain(h.slug);
        expect((await t.get(`/api/v1/news/${h.slug}`)).status).toBe(404);
      }
    } finally {
      await t.db.news.deleteMany({ where: { slug: { in: hidden.map((h) => h.slug) } } });
    }
  });

  it('карточка новости и одинаковый 404 для несуществующей', async () => {
    const res = await t.get('/api/v1/news/demo-catalog-search?lang=en');
    expect(res.body).toMatchObject({ slug: 'demo-catalog-search', contentLang: 'en', dataOrigin: 'demo' });
    expect(String(res.body['bodyText'])).toContain('reference code');
    const missing = await t.get('/api/v1/news/no-such-news');
    expect(missing.status).toBe(404);
    expect((missing.body['error'] as Item)['code']).toBe('NOT_FOUND');
  });

  it('проверяет параметры', async () => {
    expect((await t.get('/api/v1/news?pageSize=500')).status).toBe(400);
    expect((await t.get('/api/v1/news?page=0')).status).toBe(400);
    expect((await t.get('/api/v1/news?rubric=no-such')).body['total']).toBe(0);
  });
});

describe('главная: агрегат GET /home', () => {
  it('новости, направления «Истории в документах» и публикации', async () => {
    const res = await t.get('/api/v1/home?lang=ru');
    expect(res.status).toBe(200);
    const feed = await t.get('/api/v1/news?lang=ru&pageSize=3');
    expect(res.body['news']).toEqual(feed.body.items);
    const history = res.body['history'] as { topics: Item[]; publications: Item[]; documents: Item[] };
    expect(history.topics).toHaveLength(11);
    expect(history.topics.find((x) => x['slug'] === 'region')).toMatchObject({ publicationCount: 1 });
    expect(history.publications.map((p) => p['slug']).sort()).toEqual(['demo-how-to-read-archive-code', 'demo-reading-room-visit']);
    expect(history.publications.every((p) => p['dataOrigin'] === 'demo')).toBe(true);
    expect((res.body['exhibitions'] as Item[]).map((e) => e['slug'])).toEqual(['demo-exhibition-example', 'demo-exhibition-culture']);
  });

  it('в блок документов попадают только эффективно открытые документы', async () => {
    const res = await t.get('/api/v1/home?lang=ru');
    const docs = (res.body['history'] as { documents: Item[] }).documents;
    const ids = docs.map((d) => d['id']);
    const keys = (await t.db.document.findMany({ where: { id: { in: ids as string[] } }, select: { sourceSystemId: true } }))
      .map((d) => d.sourceSystemId)
      .sort();
    // Эффективно открыты только эти два синтетических документа; restricted (в т. ч. по фонду) и скрытые не попадают.
    expect(keys).toEqual(['synthetic:TEST-1/1/1/1', 'synthetic:TEST-1/1/1/5']);
    expect(res.raw).not.toContain('Служебная переписка');
    expect(res.raw).not.toContain('Ведомость начисления');
    for (const d of docs) expect((d['archiveCode'] as Item)['formatted']).toMatch(/^Ф\. /);
  });

  it('документ исчезает с главной, как только он или его опись становятся ограниченными', async () => {
    const docId = await idOf(t.db, 'documents', 'TEST-1/1/1/1');
    const doc = await t.db.document.findUniqueOrThrow({ where: { id: docId }, select: { case: { select: { inventoryId: true } } } });
    const inventoryId = doc.case.inventoryId;
    try {
      await t.db.inventory.update({ where: { id: inventoryId }, data: { accessLevel: 'restricted' } });
      const res = await t.get('/api/v1/home');
      const ids = (res.body['history'] as { documents: Item[] }).documents.map((d) => d['id']);
      expect(ids).not.toContain(docId);
    } finally {
      await t.db.inventory.update({ where: { id: inventoryId }, data: { accessLevel: 'open' } });
    }
  });
});
