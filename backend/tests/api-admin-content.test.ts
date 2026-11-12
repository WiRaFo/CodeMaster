import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INFO_PAGES } from '../prisma/seeds/info-pages.ts';
import { parseMarkup, toMarkup } from '../src/modules/admin/page-markup.ts';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** Справочные страницы и вопросы-ответы в панели (F-052; дополнение к ТЗ §2). */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let editor: Client;
let moderator: Client;
let original: { title: string; lead: string | null; body: unknown } | null = null;

beforeAll(async () => {
  t = await testApp();
  editor = await login(t.app, (await createStaff(t.db, 'site_admin')).email, undefined, '10.0.11.1');
  moderator = await login(t.app, (await createStaff(t.db, 'moderator')).email, undefined, '10.0.11.2');
  const page = await t.db.page.findUniqueOrThrow({ where: { key: 'reading-room' }, include: { translations: { where: { locale: 'ru' } } } });
  const ru = page.translations[0];
  original = ru ? { title: ru.title, lead: ru.lead, body: ru.body } : null;
});
afterAll(async () => {
  const page = await t.db.page.findUniqueOrThrow({ where: { key: 'reading-room' } });
  if (original) await t.db.pageTranslation.update({ where: { pageId_locale: { pageId: page.id, locale: 'ru' } }, data: { title: original.title, lead: original.lead, body: original.body ?? {} } });
  await t.db.faqItem.deleteMany({ where: { translations: { some: { question: { startsWith: 'Тестовый вопрос' } } } } });
  await cleanupStaff(t.db);
  await t.close();
});

describe('разметка страниц', () => {
  it('заголовки, списки, ссылки, «ожидаются сведения»; без https — ошибка с номером строки', () => {
    const text = '## Перед визитом\n- первый\n- второй\n\nАбзац\nпродолжение.\n\n! Правила ожидаются.\n[eGov.kz](https://egov.kz) — внешний ресурс\n1. шаг';
    const { blocks, issues } = parseMarkup(text);
    expect(issues).toEqual([]);
    expect(blocks.map((b) => b.type)).toEqual(['h', 'ul', 'p', 'pending', 'links', 'ol']);
    expect(blocks[2]).toEqual({ type: 'p', text: 'Абзац продолжение.' });
    expect(parseMarkup(toMarkup(blocks)).blocks).toEqual(blocks);
    expect(parseMarkup('Текст\n[Сайт](http://example.kz)').issues).toEqual([{ line: 2, message: 'Адрес ссылки должен начинаться с https:// или /files/documents/ (http://example.kz)' }]);
    // Документ на самом сайте: только PDF из /files/documents/, без выхода из папки.
    expect(parseMarkup('[Прейскурант](/files/documents/preyskurant-289-2023-ru.pdf) — скан').blocks).toEqual([{ type: 'links', items: [{ label: 'Прейскурант', url: '/files/documents/preyskurant-289-2023-ru.pdf', note: 'скан' }] }]);
    for (const bad of ['/files/documents/../x.pdf', '/files/documents/a.html', '/admin/x.pdf', 'javascript:alert(1)']) {
      const parsed = parseMarkup(`[x](${bad})`);
      expect(parsed.issues.length).toBeGreaterThan(0);
      expect(parsed.blocks.some((b) => b.type === 'links')).toBe(false);
    }
    expect(parseMarkup('<script>alert(1)</script>').blocks).toEqual([{ type: 'p', text: '<script>alert(1)</script>' }]);
  });

  it('таблица: первая строка — заголовки, пустые ячейки сохраняются; лишняя ячейка и плохой заголовок — ошибки с номером строки', () => {
    const { blocks, issues } = parseMarkup('## Цены\n| Индекс | Наименование | Цена |\n| 1.1. | Группа | |\n| 1.1.1. | Позиция | 832,0 |\nПосле таблицы.');
    expect(issues).toEqual([]);
    expect(blocks).toEqual([
      { type: 'h', text: 'Цены' },
      { type: 'table', head: ['Индекс', 'Наименование', 'Цена'], rows: [['1.1.', 'Группа', ''], ['1.1.1.', 'Позиция', '832,0']] },
      { type: 'p', text: 'После таблицы.' },
    ]);
    expect(parseMarkup(toMarkup(blocks)).blocks).toEqual(blocks);
    expect(parseMarkup('| a | b |\n| 1 | 2 | 3 |').issues).toEqual([{ line: 2, message: 'В строке таблицы 3 ячеек, а в заголовке 2' }]);
    expect(parseMarkup('| только один |').issues).toContainEqual({ line: 1, message: 'Заголовок таблицы: от 2 до 6 непустых столбцов через «|»' });
    expect(parseMarkup('| a | | b |').issues[0]?.message).toMatch(/^Заголовок таблицы/);
  });

  it('прейскурант целиком помещается в редактор и переживает сохранение без потерь', () => {
    const paid = INFO_PAGES.find((p) => p.key === 'services/paid');
    for (const lang of ['ru', 'kk'] as const) {
      const blocks = paid?.blocks[lang] ?? [];
      const markup = toMarkup(blocks);
      expect(markup.length).toBeLessThanOrEqual(30_000);
      const parsed = parseMarkup(markup);
      expect(parsed.issues).toEqual([]);
      expect(parsed.blocks).toEqual(blocks);
    }
  });
});

describe('справочные страницы', () => {
  it('редактор сайта меняет страницу: сайт отдаёт новые блоки, журнал записан; модератор не может сохранять', async () => {
    const form = await editor.request('GET', '/api/v1/admin/pages/reading-room');
    expect(form.status).toBe(200);
    const tr = form.body['translations'] as Record<string, { title: string; lead: string | null; markup: string }>;
    expect(tr['ru']?.markup).toContain('! Правила работы читального зала');
    const body = {
      actualizedAt: '2026-11-11',
      translations: { ru: { title: 'Читальный зал', lead: tr['ru']?.lead ?? '', markup: '## Часы\nПн–пт 9:00–16:00.\n\n! Правила ожидаются.' } },
    };
    expect((await moderator.request('PUT', '/api/v1/admin/pages/reading-room', body)).status).toBe(403);
    const saved = await editor.request('PUT', '/api/v1/admin/pages/reading-room', body, { 'if-match': form.body['updatedAt'] as string });
    expect(saved.status).toBe(200);
    expect(saved.body['changed']).toEqual(['ru']);
    const pub = await t.app.inject({ method: 'GET', url: '/api/v1/pages/reading-room?lang=ru' });
    expect(pub.json()).toMatchObject({ actualizedAt: '2026-11-11', blocks: [{ type: 'h', text: 'Часы' }, { type: 'p' }, { type: 'pending' }] });
    expect(await t.db.auditLog.count({ where: { entityType: 'page', summary: { contains: 'Читальный зал' } } })).toBeGreaterThan(0);
    expect((await editor.request('PUT', '/api/v1/admin/pages/reading-room', body, { 'if-match': '2020-01-01T00:00:00.000Z' })).status).toBe(409);
  });

  it('ошибка разметки — 400, ничего не сохранено; неизвестная страница — 404', async () => {
    const before = await t.app.inject({ method: 'GET', url: '/api/v1/pages/reading-room?lang=ru' });
    const bad = await editor.request('PUT', '/api/v1/admin/pages/reading-room', { actualizedAt: '2026-11-11', translations: { ru: { title: 'Читальный зал', lead: '', markup: '[x](javascript:alert(1))' } } });
    expect(bad.status).toBe(400);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/pages/reading-room?lang=ru' })).body).toBe(before.body);
    expect((await editor.request('GET', '/api/v1/admin/pages/about/history')).status).toBe(404);
  });
});

describe('вопросы и ответы', () => {
  it('добавление в тему, публикация, группировка на сайте, снятие и удаление с подтверждением', async () => {
    const input = { topic: 'visit', sortOrder: 0, published: true, dataOrigin: 'demo', translations: { ru: { question: 'Тестовый вопрос о визите?', answer: 'Тестовый ответ о визите.' } } };
    expect((await moderator.request('POST', '/api/v1/admin/faq', input)).status).toBe(403);
    const created = await editor.request('POST', '/api/v1/admin/faq', input);
    expect(created.status).toBe(201);
    const id = created.body['id'] as string;
    const pub = (await t.app.inject({ method: 'GET', url: '/api/v1/faq?lang=ru' })).json() as { items: Array<{ id: string; topic: string }> };
    const topics = pub.items.map((i) => i.topic);
    expect(pub.items.find((i) => i.id === id)?.topic).toBe('visit');
    expect(topics).toEqual([...topics].sort((a, b) => ['services', 'catalog', 'access', 'visit', 'site'].indexOf(a) - ['services', 'catalog', 'access', 'visit', 'site'].indexOf(b)));
    expect((await editor.request('PUT', `/api/v1/admin/faq/${id}`, { ...input, published: false })).status).toBe(200);
    const after = (await t.app.inject({ method: 'GET', url: '/api/v1/faq?lang=ru' })).json() as { items: Array<{ id: string }> };
    expect(after.items.some((i) => i.id === id)).toBe(false);
    expect((await editor.request('DELETE', `/api/v1/admin/faq/${id}`, {})).status).toBe(400);
    expect((await editor.request('DELETE', `/api/v1/admin/faq/${id}`, { confirm: true })).status).toBe(204);
    expect(await t.db.auditLog.count({ where: { entityType: 'faq', entityId: id } })).toBe(3);
  });

  it('неверная тема и пустой русский вопрос — 400', async () => {
    expect((await editor.request('POST', '/api/v1/admin/faq', { topic: 'weather', sortOrder: 0, published: false, dataOrigin: 'demo', translations: { ru: { question: 'Тестовый вопрос?', answer: 'Ответ ответ.' } } })).status).toBe(400);
    expect((await editor.request('POST', '/api/v1/admin/faq', { topic: 'site', sortOrder: 0, published: false, dataOrigin: 'demo', translations: { kk: { question: 'Тестовый вопрос kk?', answer: 'Ответ ответ.' } } })).status).toBe(400);
  });
});
