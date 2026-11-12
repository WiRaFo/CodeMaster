import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** ЭТАП 8. Выставки в панели управления (ТЗ §6.5, §6.7; F-093, F-148). */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let editor: Client;
let moderator: Client;
let archivist: Client;
const suffix = Math.random().toString(36).slice(2, 7);
const slug = `test-ex-${suffix}`;

beforeAll(async () => {
  t = await testApp();
  editor = await login(t.app, (await createStaff(t.db, 'editor')).email, undefined, '10.0.8.1');
  moderator = await login(t.app, (await createStaff(t.db, 'moderator')).email, undefined, '10.0.8.2');
  archivist = await login(t.app, (await createStaff(t.db, 'archivist')).email, undefined, '10.0.8.3');
});
afterAll(async () => {
  await cleanupStaff(t.db);
  await t.close();
});

const exInput = (over: Record<string, unknown> = {}) => ({
  slug,
  yearFrom: 1950,
  yearTo: 1960,
  dataOrigin: 'demo',
  topics: ['industry'],
  translations: { ru: { title: `[Демо] Тестовая выставка ${suffix}`, lead: 'Вводный текст', description: null } },
  ...over,
});
const item = (title: string, sourceNote: string | null = 'Демонстрационный источник') => ({ translations: { ru: { title, description: 'Описание', sourceNote } } });

describe('права на выставки (S-004)', () => {
  it('сотрудник архива без прав на выставки получает 403 на чтение и создание', async () => {
    expect((await archivist.request('GET', '/api/v1/admin/exhibitions')).status).toBe(403);
    expect((await archivist.request('POST', '/api/v1/admin/exhibitions', exInput({ slug: `${slug}-x` }))).status).toBe(403);
  });
});

describe('выставка от черновика до публикации (F-148, F-150)', () => {
  let id = '';
  const items: string[] = [];

  it('редактор создаёт черновик и экспонаты; порядок меняется кнопками «выше/ниже»', async () => {
    const created = await editor.request('POST', '/api/v1/admin/exhibitions', exInput());
    expect(created.status).toBe(201);
    id = String(created.body['id']);
    expect((await editor.request('POST', '/api/v1/admin/exhibitions', exInput())).status).toBe(409);
    for (const title of ['Первый', 'Второй', 'Третий']) {
      const r = await editor.request('POST', `/api/v1/admin/exhibitions/${id}/items`, item(title, title === 'Третий' ? null : 'Источник'));
      expect(r.status).toBe(201);
      items.push(String(r.body['id']));
    }
    expect((await editor.request('POST', `/api/v1/admin/exhibitions/${id}/items/${items[2]}/move`, { direction: 'up' })).status).toBe(200);
    expect((await editor.request('POST', `/api/v1/admin/exhibitions/${id}/items/${items[0]}/move`, { direction: 'up' })).status).toBe(409);
    const view = await editor.request('GET', `/api/v1/admin/exhibitions/${id}`);
    expect((view.body['items'] as Array<{ translations: { ru: { title: string } } }>).map((i) => i.translations.ru.title)).toEqual(['Первый', 'Третий', 'Второй']);
    expect(view.body['status']).toBe('draft');
    expect(view.body['actions']).toEqual(['submit']);
  });

  it('неполная выставка не уходит на проверку: сервер перечисляет поля', async () => {
    const res = await editor.request('POST', `/api/v1/admin/exhibitions/${id}/submit`);
    expect(res.status).toBe(422);
    const details = (res.body['error'] as { details: Array<{ path: string[] }> }).details.map((d) => d.path.join('.'));
    expect(details).toEqual(['translations.ru.description', 'items.1.ru.sourceNote']);
  });

  it('загруженное изображение экспоната не публично до антивирусной проверки; у экспоната с изображением нужен alt', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5d6c3f20000000049454e44ae426082', 'hex');
    const upload = (body: Buffer) =>
      t.app.inject({ method: 'POST', url: `/api/v1/admin/exhibitions/${id}/items/${items[0]}/image`, headers: { cookie: editor.cookie, 'x-csrf-token': editor.csrf, 'content-type': 'image/png', 'x-filename': 'photo.png' }, payload: body });
    expect((await upload(Buffer.from('<svg><script>alert(1)</script></svg>'))).statusCode).toBe(415);
    const ok = await upload(png);
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ antivirusStatus: 'pending' });
    const preview = await t.app.inject({ method: 'GET', url: `/api/v1/admin/exhibitions/${id}/items/${items[0]}/image`, headers: { cookie: editor.cookie } });
    expect(preview.statusCode).toBe(200);
    const view = await editor.request('GET', `/api/v1/admin/exhibitions/${id}`);
    expect((view.body['issues'] as Array<{ path: string[] }>).map((d) => d.path.join('.'))).toContain('items.0.ru.altText');
  });

  it('полный цикл: отправка → доработка с комментарием → одобрение → публикация; выставка на сайте в заданном порядке', async () => {
    const full = exInput({ translations: { ru: { title: `[Демо] Тестовая выставка ${suffix}`, lead: 'Вводный текст', description: 'Описание выставки' } } });
    expect((await editor.request('PATCH', `/api/v1/admin/exhibitions/${id}`, full)).status).toBe(200);
    expect((await editor.request('PATCH', `/api/v1/admin/exhibitions/${id}/items/${items[2]}`, item('Третий'))).status).toBe(200);
    expect((await editor.request('PATCH', `/api/v1/admin/exhibitions/${id}/items/${items[0]}`, { translations: { ru: { title: 'Первый', sourceNote: 'Источник', altText: 'Фото первого' } } })).status).toBe(200);
    expect((await editor.request('POST', `/api/v1/admin/exhibitions/${id}/submit`)).status).toBe(200);

    const notes = await moderator.request('GET', '/api/v1/admin/notifications');
    expect((notes.body['items'] as Array<{ entityId: string; entityType: string }>).some((n) => n.entityId === id && n.entityType === 'exhibitions')).toBe(true);
    expect((await moderator.request('PATCH', `/api/v1/admin/exhibitions/${id}`, full)).status).toBe(403);
    expect((await moderator.request('POST', `/api/v1/admin/exhibitions/${id}/publish`)).status).toBe(409);
    expect((await moderator.request('POST', `/api/v1/admin/exhibitions/${id}/request-changes`, {})).status).toBe(400);
    expect((await moderator.request('POST', `/api/v1/admin/exhibitions/${id}/request-changes`, { comment: 'Уточните годы' })).status).toBe(200);
    const back = await editor.request('GET', '/api/v1/admin/notifications');
    expect((back.body['items'] as Array<{ message: string }>).some((n) => n.message.includes('Уточните годы'))).toBe(true);

    expect((await editor.request('PATCH', `/api/v1/admin/exhibitions/${id}`, { ...full, yearTo: 1965 })).status).toBe(200);
    expect((await editor.request('POST', `/api/v1/admin/exhibitions/${id}/submit`)).status).toBe(200);
    expect((await moderator.request('POST', `/api/v1/admin/exhibitions/${id}/approve`)).status).toBe(200);
    expect((await t.get(`/api/v1/exhibitions/${slug}`)).status).toBe(404);
    expect((await editor.request('POST', `/api/v1/admin/exhibitions/${id}/publish`)).status).toBe(200);

    const pub = await t.get(`/api/v1/exhibitions/${slug}?lang=ru`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ yearFrom: 1950, yearTo: 1965, dataOrigin: 'demo' });
    const pubItems = pub.body['items'] as Array<{ title: string; image: unknown }>;
    expect(pubItems.map((i) => i.title)).toEqual(['Первый', 'Третий', 'Второй']);
    // Изображение ещё не проверено антивирусом — на сайте его нет.
    expect(pubItems[0]?.image).toBeNull();

    // Правка опубликованной выставки не может сделать её неполной.
    expect((await editor.request('PATCH', `/api/v1/admin/exhibitions/${id}/items/${items[1]}`, item('Второй', null))).status).toBe(422);
  });

  it('снятие с публикации требует подтверждения; после него выставки нет на сайте; всё записано в журнал', async () => {
    expect((await editor.request('POST', `/api/v1/admin/exhibitions/${id}/archive`, {})).status).toBe(400);
    expect((await editor.request('POST', `/api/v1/admin/exhibitions/${id}/archive`, { confirm: true })).status).toBe(200);
    expect((await t.get(`/api/v1/exhibitions/${slug}`)).status).toBe(404);
    const actions = (await t.db.auditLog.findMany({ where: { entityType: 'exhibitions', entityId: id }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['create', 'update', 'upload', 'status_change']));
    expect(actions.filter((a) => a === 'status_change')).toHaveLength(6);
    expect((await editor.request('DELETE', `/api/v1/admin/exhibitions/${id}`, {})).status).toBe(400);
    expect((await editor.request('DELETE', `/api/v1/admin/exhibitions/${id}`, { confirm: true })).status).toBe(204);
    expect((await editor.request('GET', `/api/v1/admin/exhibitions/${id}`)).status).toBe(404);
  });
});
