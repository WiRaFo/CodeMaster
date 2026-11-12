import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/**
 * «Об архиве» в панели (F-023, F-021): разделы текста, сотрудники, соцсети и фотогалерея учреждения.
 * Сайт показывает только опубликованное; фото — только проверенное антивирусом и с описанием.
 */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let editor: Client;
let moderator: Client;
let originalSocial: unknown = null;

const SECTION = 'about/achievements';
const STAFF_NAME = '[Демо] Тестовый Сотрудник';
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5d6c3f20000000049454e44ae426082', 'hex');

beforeAll(async () => {
  t = await testApp();
  editor = await login(t.app, (await createStaff(t.db, 'editor')).email, undefined, '10.0.13.1');
  moderator = await login(t.app, (await createStaff(t.db, 'moderator')).email, undefined, '10.0.13.2');
  originalSocial = (await t.db.siteSetting.findUnique({ where: { key: 'social_links' } }))?.value ?? null;
});
afterAll(async () => {
  await t.db.page.deleteMany({ where: { key: SECTION } });
  const people = await t.db.staffContactTranslation.findMany({ where: { fullName: STAFF_NAME }, select: { staffContactId: true } });
  await t.db.staffContact.deleteMany({ where: { id: { in: people.map((p) => p.staffContactId) } } });
  const items = await t.db.galleryItem.findMany({ where: { gallery: { slug: 'about-archive' } }, select: { assetId: true } });
  await t.db.gallery.deleteMany({ where: { slug: 'about-archive' } });
  await t.db.digitalAsset.deleteMany({ where: { id: { in: items.map((i) => i.assetId) } } });
  if (originalSocial !== null) await t.db.siteSetting.update({ where: { key: 'social_links' }, data: { value: originalSocial as never } });
  await cleanupStaff(t.db);
  await t.close();
});

const paths = (body: Record<string, unknown>) => (body['error'] as { details: Array<{ path: Array<string | number> }> }).details.map((d) => d.path.join('.'));
const about = async (lang = 'ru') => (await t.app.inject({ method: 'GET', url: `/api/v1/about?lang=${lang}` })).json() as {
  history: { title: string; blocks: unknown[] } | null;
  sections: Array<{ key: string; title: string; blocks: Array<{ type: string }> }>;
  staff: Array<{ fullName: string }>;
  social: unknown[];
  gallery: Array<{ url: string; alt: string; caption: string | null; dataOrigin: string }>;
};

describe('«Об архиве» в панели', () => {
  it('модератор получает 403; сводка показывает разделы, историю из миграции и сотрудников', async () => {
    expect((await moderator.request('GET', '/api/v1/admin/about')).status).toBe(403);
    expect((await moderator.request('PUT', `/api/v1/admin/about/sections/${SECTION}`, {})).status).toBe(403);
    const res = await editor.request('GET', '/api/v1/admin/about');
    expect(res.status).toBe(200);
    const sections = res.body['sections'] as Array<{ key: string; exists: boolean; published: boolean }>;
    expect(sections.map((s) => s.key)).toEqual(['about/history', 'about/activities', 'about/mission', 'about/achievements']);
    expect(sections[0]).toMatchObject({ exists: true, published: true });
    expect(sections[3]).toMatchObject({ exists: false, published: false });
    expect((res.body['staff'] as unknown[]).length).toBe(10);
    expect(res.body).toMatchObject({ canPublish: true, canUpload: true, hasMainBranch: true });
    // История из миграции хранится прежним форматом; панель отдаёт её разметкой.
    const history = await editor.request('GET', '/api/v1/admin/about/sections/about/history');
    expect((history.body['translations'] as { ru: { markup: string } }).ru.markup).toMatch(/^Государственный архив Восточно-Казахстанской области образован в 1940 году/);
    expect((await editor.request('GET', '/api/v1/admin/about/sections/about/unknown')).status).toBe(404);
  });

  it('новый раздел: черновик не виден, публикация видна, ошибка разметки — 400 с номером строки, конфликт версий — 409', async () => {
    const body = (published: boolean, markup = 'Демонстрационный первый абзац.\n\n## Награды\n- Грамота') => ({
      published, actualizedAt: '2026-11-10', translations: { ru: { title: '[Демо] Достижения', lead: '', markup } },
    });
    const draft = await editor.request('PUT', `/api/v1/admin/about/sections/${SECTION}`, body(false));
    expect(draft.status).toBe(200);
    expect((await about()).sections.find((s) => s.key === SECTION)).toBeUndefined();
    const bad = await editor.request('PUT', `/api/v1/admin/about/sections/${SECTION}`, body(true, 'Текст\n[ссылка](http://x.kz)'), { 'if-match': String(draft.body['updatedAt']) });
    expect(bad.status).toBe(400);
    expect(paths(bad.body)).toEqual(['translations.ru.markup.2']);
    const empty = await editor.request('PUT', `/api/v1/admin/about/sections/${SECTION}`, body(true, ''), { 'if-match': String(draft.body['updatedAt']) });
    expect(paths(empty.body)).toEqual(['translations.ru.markup.1']);
    const published = await editor.request('PUT', `/api/v1/admin/about/sections/${SECTION}`, body(true), { 'if-match': String(draft.body['updatedAt']) });
    expect(published.status).toBe(200);
    expect((await editor.request('PUT', `/api/v1/admin/about/sections/${SECTION}`, body(true), { 'if-match': String(draft.body['updatedAt']) })).status).toBe(409);
    const site = await about('kk');
    expect(site.sections.find((s) => s.key === SECTION)).toMatchObject({ title: '[Демо] Достижения', contentLang: 'ru', blocks: [{ type: 'p' }, { type: 'h' }, { type: 'ul' }] });
    expect(site.history?.blocks.length).toBeGreaterThan(0);
    const page = await t.db.page.findUniqueOrThrow({ where: { key: SECTION }, select: { id: true } });
    expect(await t.db.auditLog.count({ where: { entityType: 'page', entityId: page.id } })).toBe(2);
  });

  it('сотрудник: проверка ввода, скрытый не виден на сайте, удаление только с подтверждением', async () => {
    const input = (published: boolean, over: Record<string, unknown> = {}) => ({
      phone: '+7 (7232) 00-00-00', email: '', sortOrder: 999, published, dataOrigin: 'demo',
      translations: { ru: { fullName: STAFF_NAME, position: 'Проверочная должность', department: '' } }, ...over,
    });
    const bad = await editor.request('POST', '/api/v1/admin/about/staff', input(false, { email: 'не почта', phone: '<b>', translations: {} }));
    expect(bad.status).toBe(400);
    expect(paths(bad.body)).toEqual(expect.arrayContaining(['email', 'phone', 'translations.ru.fullName']));
    const created = await editor.request('POST', '/api/v1/admin/about/staff', input(false));
    expect(created.status).toBe(201);
    const id = String(created.body['id']);
    expect((await about()).staff.some((s) => s.fullName === STAFF_NAME)).toBe(false);
    const shown = await editor.request('PUT', `/api/v1/admin/about/staff/${id}`, input(true), { 'if-match': String(created.body['updatedAt']) });
    expect(shown.status).toBe(200);
    expect((await about()).staff.at(-1)?.fullName).toBe(STAFF_NAME);
    expect((await editor.request('DELETE', `/api/v1/admin/about/staff/${id}`, {})).status).toBe(400);
    expect((await editor.request('DELETE', `/api/v1/admin/about/staff/${id}`, { confirm: true })).status).toBe(204);
    expect((await about()).staff.some((s) => s.fullName === STAFF_NAME)).toBe(false);
    expect(await t.db.auditLog.count({ where: { entityType: 'staff_contact', entityId: id } })).toBe(3);
  });

  it('соцсети: только https и одна ссылка на сеть; сохранённое сразу на сайте', async () => {
    const bad = await editor.request('PUT', '/api/v1/admin/about/social', { items: [
      { network: 'instagram', label: 'a', url: 'http://instagram.com/x' },
      { network: 'instagram', label: 'Второй', url: 'https://instagram.com/y' },
    ] });
    expect(bad.status).toBe(400);
    expect(paths(bad.body)).toEqual(expect.arrayContaining(['items.0.label', 'items.0.url', 'items']));
    const items = [{ network: 'facebook', label: 'vkoarhiv', url: 'https://www.facebook.com/vkoarhiv' }];
    expect((await editor.request('PUT', '/api/v1/admin/about/social', { items })).status).toBe(200);
    expect((await about()).social).toEqual(items);
  });

  it('фото учреждения: до антивируса и без описания не на сайте; после — по номеру; порядок и удаление', async () => {
    const upload = (client: Client, name: string, query = '') =>
      t.app.inject({ method: 'POST', url: `/api/v1/admin/about/gallery${query}`, headers: { cookie: client.cookie, 'x-csrf-token': client.csrf, 'content-type': 'image/png', 'x-filename': name }, payload: png });
    expect((await upload(moderator, 'a.png')).statusCode).toBe(403);
    const notImage = await t.app.inject({ method: 'POST', url: '/api/v1/admin/about/gallery', headers: { cookie: editor.cookie, 'x-csrf-token': editor.csrf, 'content-type': 'application/octet-stream' }, payload: Buffer.from('<svg onload=alert(1)>') });
    expect(notImage.statusCode).toBe(415);
    expect((await upload(editor, 'zdanie.png')).statusCode).toBe(201);
    const second = await upload(editor, 'zal.png', '?dataOrigin=demo');
    const gallery = (second.json() as { gallery: Array<{ id: string; filename: string; antivirusStatus: string; dataOrigin: string }> }).gallery;
    expect(gallery.map((g) => [g.filename, g.antivirusStatus, g.dataOrigin])).toEqual([['zdanie.png', 'pending', 'verified'], ['zal.png', 'pending', 'demo']]);
    const [first, last] = gallery;
    expect((await editor.request('GET', `/api/v1/admin/about/gallery/${first?.id}`)).status).toBe(200);
    expect((await about()).gallery).toEqual([]);

    // Антивирус пропустил оба файла, но описания пока нет только у второго.
    const assets = await t.db.galleryItem.findMany({ where: { gallery: { slug: 'about-archive' } }, select: { assetId: true } });
    await t.db.digitalAsset.updateMany({ where: { id: { in: assets.map((a) => a.assetId) } }, data: { antivirusStatus: 'clean' } });
    const noAlt = await editor.request('PUT', `/api/v1/admin/about/gallery/${first?.id}`, { translations: { ru: { altText: '', caption: '' } } });
    expect(paths(noAlt.body)).toEqual(['translations.ru.altText']);
    await editor.request('PUT', `/api/v1/admin/about/gallery/${first?.id}`, { translations: { ru: { altText: 'Здание архива', caption: 'Главный корпус' } } });
    let site = await about('en');
    expect(site.gallery).toEqual([{ url: '/api/v1/about/gallery/1', width: null, height: null, alt: 'Здание архива', caption: 'Главный корпус', contentLang: 'ru', dataOrigin: 'verified' }]);
    const image = await t.app.inject({ method: 'GET', url: '/api/v1/about/gallery/1' });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-security-policy']).toContain('sandbox');
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/about/gallery/2' })).statusCode).toBe(404);

    await editor.request('PUT', `/api/v1/admin/about/gallery/${last?.id}`, { translations: { ru: { altText: 'Читальный зал', caption: '' } } });
    expect((await editor.request('POST', `/api/v1/admin/about/gallery/${last?.id}/move`, { direction: 'down' })).status).toBe(409);
    await editor.request('POST', `/api/v1/admin/about/gallery/${last?.id}/move`, { direction: 'up' });
    site = await about();
    expect(site.gallery.map((g) => [g.alt, g.dataOrigin])).toEqual([['Читальный зал', 'demo'], ['Здание архива', 'verified']]);

    expect((await editor.request('DELETE', `/api/v1/admin/about/gallery/${last?.id}`, {})).status).toBe(400);
    const removed = await editor.request('DELETE', `/api/v1/admin/about/gallery/${last?.id}`, { confirm: true });
    expect((removed.body['gallery'] as unknown[]).length).toBe(1);
    expect((await about()).gallery.map((g) => g.alt)).toEqual(['Здание архива']);
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/about/gallery/2' })).statusCode).toBe(404);
  });
});
