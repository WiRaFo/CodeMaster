import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAt } from './render.tsx';

/** «Об архиве» в панели (F-023, F-021): разделы, сотрудники, соцсети, фотогалерея; без права публикации — только просмотр. */
const CSRF = 'c'.repeat(64);
const ME = (permissions: string[]) => ({ user: { id: 'u1', email: 'editor@archive.local', fullName: '[Демо] Редактор' }, roles: [], permissions, csrfToken: CSRF });
const STAFF = { id: 's1', phone: '8 (7232) 25-13-22', email: null, sortOrder: 0, published: true, dataOrigin: 'verified', updatedAt: '2026-11-10T10:00:00.000Z', translations: { ru: { fullName: 'Жапаров Аскар Кенжебаевич', position: 'Директор', department: 'Руководство' } } };
const PHOTO = { id: 'g1', filename: 'zdanie.png', mimeType: 'image/png', antivirusStatus: 'pending', dataOrigin: 'verified', translations: {} };
const SECTIONS = [
  { key: 'about/history', title: 'История архива', exists: true, published: true, languages: ['ru'], updatedAt: '2026-11-10T10:00:00.000Z' },
  { key: 'about/activities', title: 'Деятельность архива', exists: false, published: false, languages: [], updatedAt: null },
];

type Call = { key: string; body: unknown; headers: Record<string, string> };
let calls: Call[];
let permissions: string[];
let gallery: unknown[];

beforeEach(() => {
  calls = [];
  gallery = [];
  permissions = ['pages:edit', 'pages:publish', 'assets:upload'];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push({ key, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const canPublish = permissions.includes('pages:publish');
    if (key === 'GET /api/v1/auth/me') return ok(ME(permissions));
    if (key === 'GET /api/v1/admin/notifications') return ok({ unread: 0, items: [] });
    if (key === 'GET /api/v1/admin/about') {
      return ok({
        sections: SECTIONS, staff: [STAFF], hasMainBranch: true, gallery,
        social: { items: [{ network: 'instagram', label: '@arhiv_vko', url: 'https://www.instagram.com/arhiv_vko/' }], updatedAt: '2026-11-10T09:00:00.000Z' },
        canPublish, canUpload: canPublish && permissions.includes('assets:upload'),
      });
    }
    if (key === 'GET /api/v1/admin/about/sections/about/activities') return ok({ key: 'about/activities', exists: false, published: false, updatedAt: null, actualizedAt: null, translations: { ru: { title: 'Деятельность архива', lead: '', markup: '' } } });
    if (key === 'PUT /api/v1/admin/about/sections/about/activities') return ok({ key: 'about/activities', exists: true, published: true, updatedAt: '2026-11-10T12:00:00.000Z', changed: ['ru'] });
    if (key === 'PUT /api/v1/admin/about/staff/s1') return ok(STAFF);
    if (key === 'PUT /api/v1/admin/about/social') return ok({ items: [], updatedAt: '2026-11-10T12:00:00.000Z' });
    if (key === 'POST /api/v1/admin/about/gallery?dataOrigin=demo') {
      gallery = [{ ...PHOTO, dataOrigin: 'demo' }];
      return ok({ gallery }, 201);
    }
    if (key === 'PUT /api/v1/admin/about/gallery/g1') return ok({ gallery });
    return ok({ error: { code: 'NOT_FOUND' } }, 404);
  });
});

describe('«Об архиве» в панели (F-023, F-021)', () => {
  it('сводка: разделы со ссылками на правку, сотрудник правится с If-Match, соцсети сохраняются; axe', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/admin/about');
    expect(await screen.findByRole('link', { name: 'Деятельность архива' })).toHaveAttribute('href', '/admin/about/sections/about/activities');
    expect(screen.getByRole('cell', { name: 'Не заполнен' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Изменить: Жапаров Аскар Кенжебаевич' }));
    const form = screen.getByRole('form', { name: 'Правка сотрудника' });
    await user.clear(within(form).getAllByLabelText('Должность')[0] as HTMLElement);
    await user.type(within(form).getAllByLabelText('Должность')[0] as HTMLElement, 'Директор архива');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Сотрудник сохранён и виден на сайте.')).toBeInTheDocument();
    const put = calls.find((c) => c.key === 'PUT /api/v1/admin/about/staff/s1');
    expect(put?.headers['if-match']).toBe(STAFF.updatedAt);
    expect(put?.body).toMatchObject({ published: true, translations: { ru: { fullName: 'Жапаров Аскар Кенжебаевич', position: 'Директор архива' } } });

    const social = screen.getByRole('form', { name: 'Ссылки на соцсети' });
    await user.clear(within(social).getAllByLabelText('Адрес страницы')[0] as HTMLElement);
    await user.click(within(social).getByRole('button', { name: 'Сохранить ссылки' }));
    expect(await screen.findByText('Ссылки на соцсети сохранены.')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PUT /api/v1/admin/about/social')?.body).toEqual({ items: [] });
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('новый раздел: публикация с датой актуализации, без If-Match для ещё не созданного', async () => {
    const user = userEvent.setup();
    renderAt('/admin/about/sections/about/activities');
    const form = await screen.findByRole('form', { name: 'Правка раздела' });
    await user.type(within(form).getAllByLabelText('Текст раздела')[0] as HTMLElement, 'Архив хранит документы области.');
    await user.click(within(form).getByRole('checkbox', { name: 'Показывать на сайте' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Сохранено, раздел на сайте. Изменены языки: RU.')).toBeInTheDocument();
    const put = calls.find((c) => c.key === 'PUT /api/v1/admin/about/sections/about/activities');
    expect(put?.headers['if-match']).toBeUndefined();
    expect(put?.body).toMatchObject({ published: true, translations: { ru: { title: 'Деятельность архива', markup: 'Архив хранит документы области.' } } });
    expect(Object.keys((put?.body as { translations: object }).translations)).toEqual(['ru']);
  });

  it('фото: демонстрационная загрузка, статус антивируса, подпись отправляется только заполненными языками', async () => {
    const user = userEvent.setup();
    renderAt('/admin/about');
    const block = await screen.findByRole('region', { name: 'Фотогалерея архива (0)' });
    await user.selectOptions(within(block).getByLabelText('Происхождение'), 'demo');
    await user.upload(within(block).getByLabelText('Добавить фото'), new File([new Uint8Array([137, 80, 78, 71])], 'zdanie.png', { type: 'image/png' }));
    expect(await screen.findByRole('img', { name: 'Предпросмотр фото: zdanie.png' })).toBeInTheDocument();
    expect(screen.getByText(/«zdanie\.png»: ожидает проверки антивирусом.*нет описания.*демонстрационное/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Описание для незрячих (Русский)'), 'Здание архива');
    await user.click(screen.getByRole('button', { name: 'Сохранить подпись фото 1' }));
    expect(await screen.findByText('Подпись фото «zdanie.png» сохранена.')).toBeInTheDocument();
    expect(calls.find((c) => c.key === 'PUT /api/v1/admin/about/gallery/g1')?.body).toEqual({ translations: { ru: { altText: 'Здание архива', caption: '' } } });
  });

  it('без права публикации: только просмотр, кнопок правки и загрузки нет', async () => {
    permissions = ['pages:edit'];
    renderAt('/admin/about');
    expect(await screen.findByText('У вашей роли нет права публиковать: раздел открыт только для просмотра.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Изменить:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить сотрудника' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Сохранить ссылки' })).toBeNull();
    expect(screen.queryByLabelText('Добавить фото')).toBeNull();
  });
});
