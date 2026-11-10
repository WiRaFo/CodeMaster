import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAt } from './render.tsx';

/** «Архив памяти» в панели (F-149): хронология, личности, коллекции. */
const CSRF = 'c'.repeat(64);
const ME = (permissions: string[]) => ({ user: { id: 'u1', email: 'editor@archive.local', fullName: '[Демо] Редактор' }, roles: [], permissions, csrfToken: CSRF });
const DOC_ID = '11111111-2222-4333-8444-555555555555';
const PERSON_ID = '22222222-3333-4444-8555-666666666666';
const EVENT = { id: 'e1', slug: 'archive-founded-1940', year: 1940, date: null, published: true, dataOrigin: 'verified', sourceNote: 'История архива', updatedAt: '2026-11-10T10:00:00.000Z', title: 'Образован архив', translations: { ru: { title: 'Образован архив', description: 'Текст.' } } };
const PERSON = { id: PERSON_ID, slug: 'burov-pavel', birthYear: 1902, deathYear: 1944, published: true, dataOrigin: 'verified', sourceNote: 'Календарь', updatedAt: '2026-11-10T10:00:00.000Z', fullName: 'Буров Павел Петрович', memorableDates: 1, translations: { ru: { fullName: 'Буров Павел Петрович', biography: '' } } };

type Call = { key: string; body: unknown; headers: Record<string, string> };
let calls: Call[];
let permissions: string[];

beforeEach(() => {
  calls = [];
  permissions = ['publications:edit', 'publications:publish'];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input).split('?')[0] ?? '';
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : null, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (key === 'GET /api/v1/auth/me') return ok(ME(permissions));
    if (key === 'GET /api/v1/admin/notifications') return ok({ unread: 0, items: [] });
    if (key === 'GET /api/v1/admin/memory/events') return ok({ items: [EVENT] });
    if (key === 'GET /api/v1/admin/memory/persons') return ok({ items: [PERSON] });
    if (key === 'GET /api/v1/admin/memory/collections') return ok({ items: [] });
    if (key === 'PUT /api/v1/admin/memory/events/e1') return ok(EVENT);
    if (key === 'POST /api/v1/admin/memory/collections') return ok({}, 201);
    return ok({ error: { code: 'NOT_FOUND' } }, 404);
  });
});

describe('архив памяти в панели (F-149)', () => {
  it('хронология: правка события уходит с If-Match, только заполненные языки; axe', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/admin/memory/events');
    await user.click(await screen.findByRole('button', { name: 'Изменить: Образован архив' }));
    const form = screen.getByRole('form', { name: 'Правка события' });
    await user.type(within(form).getByLabelText('Точная дата (если известна)'), '1940-05-01');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Событие сохранено.')).toBeInTheDocument();
    const put = calls.find((c) => c.key === 'PUT /api/v1/admin/memory/events/e1');
    expect(put?.headers['if-match']).toBe(EVENT.updatedAt);
    expect(put?.body).toMatchObject({ year: '1940', date: '1940-05-01', translations: { ru: { title: 'Образован архив' } } });
    expect(Object.keys((put?.body as { translations: object }).translations)).toEqual(['ru']);
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('без права публикации — только просмотр, без кнопок правки', async () => {
    permissions = ['publications:edit'];
    renderAt('/admin/memory/persons');
    expect(await screen.findByText('Буров Павел Петрович')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Изменить/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Добавить личность' })).toBeNull();
  });

  it('коллекция: документ по ссылке на карточку, личность из списка, порядок; повтор отклоняется', async () => {
    const user = userEvent.setup();
    renderAt('/admin/memory/collections');
    await user.click(await screen.findByRole('button', { name: 'Добавить коллекцию' }));
    const form = screen.getByRole('form', { name: 'Новая коллекция' });
    await user.type(within(form).getByLabelText('Адрес'), 'test-collection');
    await user.type(within(form).getAllByLabelText('Название')[0] as HTMLElement, 'Проверка');
    const doc = within(form).getByLabelText('Документ');
    await user.type(doc, `https://archive.example/ru/catalog/documents/${DOC_ID}`);
    await user.click(within(form).getByRole('button', { name: 'Добавить документ' }));
    await user.selectOptions(within(form).getByLabelText('Личность'), PERSON_ID);
    await user.click(within(form).getByRole('button', { name: 'Добавить личность' }));
    await user.click(within(form).getByRole('button', { name: 'Выше: Личность: Буров Павел Петрович' }));
    await user.type(doc, DOC_ID);
    await user.click(within(form).getByRole('button', { name: 'Добавить документ' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Этот элемент уже в коллекции.');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'POST /api/v1/admin/memory/collections')).toBe(true));
    const post = calls.find((c) => c.key === 'POST /api/v1/admin/memory/collections');
    expect((post?.body as { items: unknown }).items).toEqual([{ type: 'person', id: PERSON_ID }, { type: 'document', id: DOC_ID }]);
  });
});
