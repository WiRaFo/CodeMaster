import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { renderAt } from './render.tsx';

const CASE_ID = '63d720d0-900d-4692-ad7a-c81cbe7fc1a4';
const DOC_ID = '11111111-2222-4333-8444-555555555555';
const CSRF = 'c'.repeat(64);

const ME = (permissions: string[]) => ({
  user: { id: 'u1', email: 'archivist@archive.local', fullName: '[Демо] Сотрудник архива' },
  roles: [{ code: 'archivist', name: 'Сотрудник архива', branchId: null }],
  permissions,
  csrfToken: CSRF,
});
const ARCHIVIST = ['assets:upload', 'catalog:delete', 'catalog:edit', 'catalog:submit'];

const DOC = {
  id: DOC_ID,
  status: 'draft',
  archiveCode: 'Ф. TEST-1. Оп. 1. Д. 1.',
  updatedAt: '2026-11-09T10:00:00.000Z',
  hasDigitalCopy: false,
  input: {
    caseId: CASE_ID,
    documentNumber: null,
    documentTypeCode: 'organization_record',
    dateFrom: null,
    dateTo: null,
    accessLevel: 'restricted',
    dataOrigin: 'demo',
    sourceNote: null,
    originalLanguages: ['ru'],
    translations: { ru: { title: '[Демо] Приказ', description: null, accessConditions: null } },
  },
  pages: [],
  actions: ['submit'],
  canEdit: true,
  canDelete: true,
  history: [{ at: '2026-11-09T10:00:00.000Z', action: 'create', summary: 'Создан черновик документа', user: '[Демо] Сотрудник архива' }],
};

type Handler = (init: RequestInit | undefined) => { status: number; body?: unknown };
let fetchMock: MockInstance<typeof fetch>;
let routes: Record<string, Handler>;

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  routes = {
    'GET /api/v1/auth/me': () => ({ status: 200, body: ME(ARCHIVIST) }),
    'GET /api/v1/admin/notifications': () => ({ status: 200, body: { unread: 1, items: [{ id: 'n1', type: 'request_changes', entityType: 'documents', entityId: DOC_ID, message: 'Возвращено на доработку: «[Демо] Приказ». Уточните дату.', createdAt: '2026-11-09T10:00:00.000Z', read: false }] } }),
    'GET /api/v1/admin/dashboard': () => ({ status: 200, body: { counts: { draft: 2 }, reviewQueue: [], publishQueue: [], mine: [{ id: DOC_ID, status: 'draft', title: '[Демо] Приказ', updatedAt: '2026-11-09T10:00:00.000Z' }] } }),
    'GET /api/v1/admin/reference': () => ({ status: 200, body: { documentTypes: [{ code: 'organization_record', name: 'Документы организаций' }], branches: [{ slug: 'main', name: 'ГА ВКО' }] } }),
    'GET /api/v1/admin/catalog/tree': () => ({ status: 200, body: { fonds: [{ id: 'f1', number: 'TEST-1', title: 'Фонд', status: 'published', access: 'open', inventories: [{ id: 'i1', number: '1', title: 'Опись', status: 'published', access: 'open', cases: [{ id: CASE_ID, number: '1', title: 'Протоколы', status: 'published', access: 'open' }] }] }] } }),
    [`GET /api/v1/admin/documents/${DOC_ID}`]: () => ({ status: 200, body: DOC }),
  };
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input).split('?')[0] ?? '';
    const key = `${init?.method ?? 'GET'} ${url}`;
    const handler = routes[key];
    if (!handler) return json(404, { error: { code: 'NOT_FOUND', message: key } });
    const r = handler(init);
    return json(r.status, r.body);
  });
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('вход в панель (F-140, сценарий 9)', () => {
  it('без сессии — форма входа; неверный пароль — понятная ошибка; после входа — обзор', async () => {
    let signedIn = false;
    routes['GET /api/v1/auth/me'] = () => (signedIn ? { status: 200, body: ME(ARCHIVIST) } : { status: 401, body: { error: { code: 'UNAUTHENTICATED' } } });
    routes['POST /api/v1/auth/login'] = (init) => {
      const body = JSON.parse(String(init?.body)) as { password: string };
      if (body.password !== 'верный-пароль') return { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'x' } } };
      signedIn = true;
      return { status: 200, body: ME(ARCHIVIST) };
    };
    const user = userEvent.setup();
    const { container } = renderAt('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Вход в панель управления' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ru');
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    expect(await axeViolations(container)).toEqual([]);

    await user.type(screen.getByLabelText('Email'), 'archivist@archive.local');
    await user.type(screen.getByLabelText('Пароль'), 'неверный');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль.');

    await user.clear(screen.getByLabelText('Пароль'));
    await user.type(screen.getByLabelText('Пароль'), 'верный-пароль');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Обзор' })).toBeInTheDocument();
    // Изменяющие запросы несут CSRF-токен, полученный при входе.
    routes['POST /api/v1/admin/notifications/n1/read'] = () => ({ status: 204 });
    await user.click(await screen.findByRole('button', { name: 'Прочитано' }));
    const call = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith('/notifications/n1/read') && i?.method === 'POST');
    expect((call?.[1]?.headers as Record<string, string>)['X-CSRF-Token']).toBe(CSRF);
  });

  it('обзор: уведомление о доработке ведёт к документу; навигация по правам роли; нет нарушений axe', async () => {
    const { container } = renderAt('/admin');
    expect(await screen.findByRole('link', { name: /Возвращено на доработку/ })).toHaveAttribute('href', `/admin/documents/${DOC_ID}`);
    const nav = screen.getByRole('navigation', { name: 'Разделы панели' });
    expect(within(nav).getByRole('link', { name: 'Документы' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Журнал действий' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Обзор (1 новых)' })).toBeInTheDocument();
    await screen.findByText('Мои черновики и документы на доработке');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('раздел без права — «Нет доступа» (проверку на сервере дублирует интерфейс)', async () => {
    renderAt('/admin/audit');
    expect(await screen.findByRole('heading', { level: 1, name: 'Нет доступа' })).toBeInTheDocument();
  });

  it('адрес панели, совпадающий с публичным разделом (/admin/exhibitions/new), открывает панель, а не страницу сайта', async () => {
    renderAt('/admin/exhibitions/new');
    expect(await screen.findByRole('heading', { level: 1, name: 'Нет доступа' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Разделы панели' })).toBeInTheDocument();
  });
});

describe('карточка документа в панели (F-144, F-146, F-154; сценарий 10)', () => {
  it('новый документ: без обязательных полей не сохраняется, ошибки перечислены и ведут к полям', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/admin/documents/new');
    await screen.findByRole('heading', { level: 1, name: 'Новый документ' });
    await screen.findByRole('option', { name: /Ф\. TEST-1\. Оп\. 1\. Д\. 1 — Протоколы/ });
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    const summary = await screen.findByRole('alert');
    expect(within(summary).getByRole('link', { name: 'Дело: обязательное поле' })).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Название (Русский): обязательное поле' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Дело/)).toHaveAttribute('aria-invalid', 'true');
    await user.click(within(summary).getByRole('link', { name: 'Вид документа: обязательное поле' }));
    expect(screen.getByLabelText(/^Вид документа/)).toHaveFocus();
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('открытый доступ сохраняется только после подтверждения в диалоге', async () => {
    const posted: unknown[] = [];
    routes['POST /api/v1/admin/documents'] = (init) => {
      posted.push(JSON.parse(String(init?.body)));
      return { status: 201, body: { id: DOC_ID } };
    };
    const user = userEvent.setup();
    const { router } = renderAt('/admin/documents/new');
    await screen.findByRole('option', { name: /Протоколы/ });
    await user.selectOptions(screen.getByLabelText(/^Дело/), CASE_ID);
    await user.selectOptions(screen.getByLabelText(/^Вид документа/), 'organization_record');
    await user.type(screen.getByRole('textbox', { name: 'Название (обязательно)' }), 'Демо: новый приказ');
    await user.click(screen.getByRole('radio', { name: /Открытый/ }));
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Открыть доступ к документу?' });
    expect(posted).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Да, открыть доступ' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/documents/${DOC_ID}`));
    expect(posted[0]).toMatchObject({ caseId: CASE_ID, accessLevel: 'open', confirmOpenAccess: true, translations: { ru: { title: 'Демо: новый приказ' } } });
  });

  it('отправка на проверку неполной карточки подсказывает поля до запроса к серверу', async () => {
    const user = userEvent.setup();
    renderAt(`/admin/documents/${DOC_ID}`);
    expect(await screen.findByTestId('doc-status')).toHaveTextContent('Черновик');
    await user.click(screen.getByRole('button', { name: 'Отправить на проверку' }));
    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Перед отправкой на проверку');
    expect(within(summary).getByRole('link', { name: 'Краткое описание (Русский): обязательное поле' })).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Условия доступа (Русский): обязательное поле' })).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Дата (начало): обязательное поле' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/submit'))).toBe(false);
  });

  it('проверяющий: кнопки только его действий, «Вернуть на доработку» требует комментария', async () => {
    routes['GET /api/v1/auth/me'] = () => ({ status: 200, body: ME(['catalog:review']) });
    routes[`GET /api/v1/admin/documents/${DOC_ID}`] = () => ({ status: 200, body: { ...DOC, status: 'in_review', actions: ['request_changes', 'approve'], canEdit: false, canDelete: false } });
    let sent: unknown = null;
    routes[`POST /api/v1/admin/documents/${DOC_ID}/request-changes`] = (init) => {
      sent = JSON.parse(String(init?.body));
      return { status: 200, body: { id: DOC_ID, status: 'needs_changes' } };
    };
    const user = userEvent.setup();
    renderAt(`/admin/documents/${DOC_ID}`);
    await screen.findByRole('button', { name: 'Одобрить' });
    expect(screen.queryByRole('button', { name: 'Опубликовать' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Удалить' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Сохранить изменения' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Название (обязательно)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Вернуть на доработку' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Вернуть на доработку' });
    const confirm = within(dialog).getByRole('button', { name: 'Вернуть на доработку' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Что нужно исправить'), 'Уточните дату.');
    await user.click(confirm);
    await waitFor(() => expect(sent).toEqual({ comment: 'Уточните дату.' }));
  });
});
