import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderAt } from './render.tsx';

/** Публикации «Цифровой истории» в панели (F-149): форма со связями, черновик без права публикации. */
const CSRF = 'c'.repeat(64);
const ME = (permissions: string[]) => ({ user: { id: 'u1', email: 'editor@archive.local', fullName: '[Демо] Редактор' }, roles: [], permissions, csrfToken: CSRF });
const DOC_ID = '11111111-2222-4333-8444-555555555555';
const PERSON_ID = '22222222-3333-4444-8555-666666666666';
const EVENT = { id: 'e1', slug: 'archive-founded-1940', year: 1940, date: null, published: true, dataOrigin: 'verified', sourceNote: 'История архива', updatedAt: '2026-11-10T10:00:00.000Z', title: 'Образован архив', translations: {} };
const PERSON = { id: PERSON_ID, slug: 'burov-pavel', birthYear: 1902, deathYear: 1944, published: true, dataOrigin: 'verified', sourceNote: 'Календарь', updatedAt: '2026-11-10T10:00:00.000Z', fullName: 'Буров Павел Петрович', memorableDates: 1, translations: {} };
const PUB = {
  id: 'p1', slug: 'demo-reading-room-visit', kind: 'article', periodText: null, yearFrom: null, yearTo: null, published: true, featured: false,
  publishedAt: '2026-11-09T00:00:00.000Z', dataOrigin: 'demo', sourceNote: '[Демо] Источник', authorship: null, sourceUrl: null,
  document: { id: DOC_ID, title: 'Закрытый протокол', visible: false }, cover: null, topics: [], settlements: ['ust-kamenogorsk'], personIds: [], eventIds: [],
  updatedAt: '2026-11-10T10:00:00.000Z', title: '[Демо] Визит в читальный зал',
  translations: { ru: { title: '[Демо] Визит в читальный зал', lead: '', bodyText: 'Первый абзац текста.' } },
};

type Call = { key: string; body: unknown; headers: Record<string, string> };
let calls: Call[];
let permissions: string[];

beforeEach(() => {
  calls = [];
  permissions = ['publications:edit', 'publications:publish', 'assets:upload'];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input).split('?')[0] ?? '';
    const key = `${init?.method ?? 'GET'} ${url}`;
    calls.push({ key, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null, headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (key === 'GET /api/v1/auth/me') return ok(ME(permissions));
    if (key === 'GET /api/v1/admin/notifications') return ok({ unread: 0, items: [] });
    if (key === 'GET /api/v1/admin/memory/publications') {
      return ok({
        items: [PUB], kinds: ['article', 'photo_story', 'biography', 'memoir'],
        topics: [{ slug: 'culture_art', name: 'Культура и искусство' }], settlements: [{ slug: 'ust-kamenogorsk', name: 'Усть-Каменогорск' }],
        canPublish: permissions.includes('publications:publish'),
      });
    }
    if (key === 'GET /api/v1/admin/memory/events') return ok({ items: [EVENT] });
    if (key === 'GET /api/v1/admin/memory/persons') return ok({ items: [PERSON] });
    if (key === 'PUT /api/v1/admin/memory/publications/p1') return ok(PUB);
    if (key === 'POST /api/v1/admin/memory/publications/p1/cover') return ok({ ...PUB, updatedAt: '2026-11-10T11:00:00.000Z', cover: { filename: 'cover.png', mimeType: 'image/png', antivirusStatus: 'pending' } }, 201);
    if (key === 'POST /api/v1/admin/memory/publications') return ok(PUB, 201);
    return ok({ error: { code: 'NOT_FOUND' } }, 404);
  });
});

describe('публикации «Цифровой истории» в панели (F-149)', () => {
  it('правка: панель предупреждает о закрытом документе, связи уходят списками id и адресов, If-Match; axe', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/admin/memory');
    await user.click(await screen.findByRole('button', { name: 'Изменить: [Демо] Визит в читальный зал' }));
    const form = screen.getByRole('form', { name: 'Правка публикации' });
    expect(within(form).getByText(/не видно на сайте/)).toBeInTheDocument();
    await user.click(within(form).getByRole('checkbox', { name: 'Культура и искусство' }));
    await user.click(within(form).getByRole('checkbox', { name: 'Буров Павел Петрович' }));
    await user.click(within(form).getByRole('checkbox', { name: '1940: Образован архив' }));
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Публикация сохранена и видна на сайте.')).toBeInTheDocument();
    const put = calls.find((c) => c.key === 'PUT /api/v1/admin/memory/publications/p1');
    expect(put?.headers['if-match']).toBe(PUB.updatedAt);
    expect(put?.body).toMatchObject({ documentId: DOC_ID, topics: ['culture_art'], settlements: ['ust-kamenogorsk'], personIds: [PERSON_ID], eventIds: ['e1'], published: true });
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('без права публикации: опубликованное не правится, новая — только черновик, документ из ссылки на карточку', async () => {
    permissions = ['publications:edit'];
    const user = userEvent.setup();
    renderAt('/admin/memory/publications');
    expect(await screen.findByText('[Демо] Визит в читальный зал')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Изменить:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Удалить:/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Добавить публикацию' }));
    const form = screen.getByRole('form', { name: 'Новая публикация' });
    expect(within(form).getByRole('checkbox', { name: 'Опубликовано на сайте' })).toBeDisabled();
    await user.type(within(form).getByLabelText('Адрес'), 'test-new');
    await user.type(within(form).getByLabelText('Документ каталога'), `https://archive.example/ru/catalog/documents/${DOC_ID}`);
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Публикация сохранена как черновик.')).toBeInTheDocument();
    const post = calls.find((c) => c.key === 'POST /api/v1/admin/memory/publications');
    expect(post?.body).toMatchObject({ slug: 'test-new', published: false, documentId: DOC_ID });
  });

  it('обложка: загрузка показывает статус проверки, следующая правка идёт с новой версией записи', async () => {
    const user = userEvent.setup();
    renderAt('/admin/memory/publications');
    await user.click(await screen.findByRole('button', { name: 'Изменить: [Демо] Визит в читальный зал' }));
    const form = screen.getByRole('form', { name: 'Правка публикации' });
    expect(within(form).getByText('Обложки нет.')).toBeInTheDocument();
    await user.upload(within(form).getByLabelText('Загрузить обложку'), new File([new Uint8Array([137, 80, 78, 71])], 'cover.png', { type: 'image/png' }));
    expect(await within(form).findByText(/ожидает проверки антивирусом/)).toBeInTheDocument();
    expect(within(form).getByRole('img', { name: 'Предпросмотр обложки: cover.png' })).toBeInTheDocument();
    await user.type(within(form).getAllByLabelText('Описание обложки для незрячих')[0] as HTMLElement, 'Читальный зал');
    await user.click(within(form).getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Публикация сохранена и видна на сайте.');
    const put = calls.find((c) => c.key === 'PUT /api/v1/admin/memory/publications/p1');
    expect(put?.headers['if-match']).toBe('2026-11-10T11:00:00.000Z');
    expect(put?.body).toMatchObject({ translations: { ru: { coverAlt: 'Читальный зал' } } });
  });
});
