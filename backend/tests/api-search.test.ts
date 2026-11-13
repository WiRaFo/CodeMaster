import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryWords, snippet } from '../src/modules/search/search.routes.ts';
import { testApp } from './helpers.ts';

/** Поиск по сайту из шапки (F-007, аудит Р3): группы по разделам, только опубликованное, шифр — в каталог. */
let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp();
});
afterAll(() => t.close());

interface Result {
  total: number;
  groups: Array<{ type: string; total: number; items: Array<{ title: string; path: string }> }>;
  catalogHint: { count: number; looksLikeCode: boolean; path: string } | null;
}
const search = async (q: string, lang = 'ru') =>
  (await t.get(`/api/v1/search?${new URLSearchParams({ q, lang }).toString()}`)).body as unknown as Result;

describe('поиск по сайту', () => {
  it('слова запроса и отрывок вокруг найденного', () => {
    expect(queryWords('Читальный  зал, «архива»')).toEqual(['читальный', 'зал', 'архива']);
    expect(snippet(`${'а '.repeat(100)}читальный зал`, ['читальный'])).toMatch(/^….*читальный зал$/u);
  });

  it('находит разделы и филиалы с адресами страниц; запрос без совпадений — пустой ответ', async () => {
    const res = await search('читальный зал');
    expect(res.groups.find((g) => g.type === 'pages')?.items.map((i) => i.path)).toContain('/reading-room');
    const branches = await search('Крылова');
    expect(branches.groups.find((g) => g.type === 'branches')?.items[0]?.path).toMatch(/^\/branches\//u);
    expect(await search('нетакогословавообще')).toMatchObject({ total: 0, groups: [], catalogHint: null });
    expect((await t.get('/api/v1/search?lang=ru')).status).toBe(400);
  });

  it('черновики и удалённые новости не находятся', async () => {
    const hidden = [
      { slug: 'test-search-draft', publicationStatus: 'draft' as const, publishedAt: new Date(), deletedAt: null },
      { slug: 'test-search-deleted', publicationStatus: 'published' as const, publishedAt: new Date(), deletedAt: new Date() },
    ];
    try {
      for (const h of hidden) {
        await t.db.news.create({ data: { ...h, dataOrigin: 'synthetic', translations: { create: { locale: 'ru', title: 'скрытаязаписьпоиска', translationStatus: 'reviewed' } } } });
      }
      expect((await search('скрытаязаписьпоиска')).total).toBe(0);
    } finally {
      await t.db.news.deleteMany({ where: { slug: { in: hidden.map((h) => h.slug) } } });
    }
  });

  it('шифр не ищется по сайту, ответ ведёт в каталог', async () => {
    const res = await search('Ф. TEST-1. Оп. 1');
    expect(res.groups).toEqual([]);
    expect(res.catalogHint).toMatchObject({ looksLikeCode: true });
    expect(res.catalogHint?.path).toMatch(/^\/catalog\?q=/u);
  });
});
