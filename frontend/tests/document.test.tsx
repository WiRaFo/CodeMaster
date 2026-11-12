import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { DOCUMENTS, apiMock, renderAt } from './render.tsx';

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock());
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const OPEN = `/ru/catalog/documents/${DOCUMENTS.open.id}`;
const RESTRICTED = `/ru/catalog/documents/${DOCUMENTS.restricted.id}`;
const requested = () => fetchMock.mock.calls.map(([u]) => String(u));

describe('карточка открытого документа (F-040 – F-042)', () => {
  it('метаданные, иерархия, пометка тестовых данных, ссылки на каталог', async () => {
    renderAt(OPEN);
    expect(await screen.findByRole('heading', { level: 1, name: '[Синтетика] Протокол заседания правления маслозавода' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Навигационная цепочка' });
    expect(within(crumbs).getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/ru');
    expect(within(crumbs).getByRole('link', { name: 'Фонды и электронный каталог' })).toHaveAttribute('href', '/ru/catalog');
    expect(within(crumbs).getByRole('link', { name: 'Фонд TEST-1' }).getAttribute('href')).toMatch(/^\/ru\/catalog\/fonds\/[0-9a-f-]+$/);
    expect(within(crumbs).getByText('[Синтетика] Протокол заседания правления маслозавода')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Тестовые данные')).toBeInTheDocument();
    expect(screen.getByTestId('origin-note')).toHaveTextContent('не является архивным документом');

    const meta = screen.getByRole('heading', { level: 2, name: 'Сведения о документе' }).closest('aside') as HTMLElement;
    const m = within(meta);
    expect(m.getByText('Архивный шифр').nextElementSibling).toHaveTextContent('Ф. TEST-1. Оп. 1. Д. 1.');
    expect(m.getByText('Дата').nextElementSibling).toHaveTextContent('1956');
    expect(m.getByText('Язык оригинала').nextElementSibling).toHaveTextContent('русский');
    expect(m.getByRole('link', { name: 'Усть-Каменогорск' })).toHaveAttribute('href', '/ru/catalog?settlement=ust-kamenogorsk');
    expect(m.getByRole('link', { name: 'История промышленных предприятий' })).toHaveAttribute('href', '/ru/catalog?topic=industry');
    expect(m.queryByText('Автор')).toBeNull();

    const transcription = screen.getByRole('heading', { level: 2, name: 'Расшифровка текста' }).closest('section') as HTMLElement;
    expect(within(transcription).getByText('Слушали: о ремонте сепаратора.')).toHaveAttribute('lang', 'ru');
  });

  it('просмотрщик: листание кнопками и клавишами, масштаб, alt из API', async () => {
    const user = userEvent.setup();
    renderAt(OPEN);
    const img = await screen.findByRole('img', { name: 'Синтетическая страница 1 из 3' });
    expect(img).toHaveAttribute('src', `/api/v1/catalog/documents/${DOCUMENTS.open.id}/pages/1/image`);
    expect(img).toHaveAttribute('lang', 'ru');
    const counter = screen.getByTestId('viewer-counter');
    expect(counter).toHaveTextContent('Страница 1 из 3 (лист 1)');
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Следующая страница' }));
    expect(counter).toHaveTextContent('Страница 2 из 3');
    expect(screen.getByRole('img', { name: 'Синтетическая страница 2 из 3' })).toHaveAttribute('src', expect.stringMatching(/\/pages\/2\/image$/));

    const stage = screen.getByRole('region', { name: 'Изображение страницы' });
    fireEvent.keyDown(stage, { key: 'End' });
    expect(counter).toHaveTextContent('Страница 3 из 3');
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
    fireEvent.keyDown(stage, { key: 'ArrowLeft' });
    expect(counter).toHaveTextContent('Страница 2 из 3');

    const zoom = screen.getByRole('status', { name: 'Масштаб' });
    expect(zoom).toHaveTextContent('100%');
    await user.click(screen.getByRole('button', { name: 'Увеличить' }));
    expect(zoom).toHaveTextContent('125%');
    expect(screen.getByRole('img', { name: /страница 2/ })).toHaveStyle({ width: '125%' });
    fireEvent.keyDown(stage, { key: '-' });
    fireEvent.keyDown(stage, { key: '-' });
    expect(zoom).toHaveTextContent('75%');
    await user.click(screen.getByRole('button', { name: 'Исходный масштаб' }));
    expect(zoom).toHaveTextContent('100%');
  });

  it('копирование шифра и «Поделиться» без Web Share копирует ссылку', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt(OPEN);
    await screen.findByRole('heading', { level: 1 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Скопировать шифр' }));
    });
    expect(writeText).toHaveBeenCalledWith('Ф. TEST-1. Оп. 1. Д. 1.');
    expect(screen.getByTestId('copy-notice')).toHaveTextContent('Шифр «Ф. TEST-1. Оп. 1. Д. 1.» скопирован');
    await waitFor(() => expect(screen.getByTestId('announcer')).toHaveTextContent('скопирован'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Поделиться' }));
    });
    expect(writeText).toHaveBeenLastCalledWith(window.location.href);
    expect(screen.getByTestId('copy-notice')).toHaveTextContent('Ссылка на документ скопирована');
  });

  it('нет нарушений axe в трёх языках', async () => {
    for (const lang of ['kk', 'ru', 'en']) {
      const { container, unmount } = renderAt(`/${lang}/catalog/documents/${DOCUMENTS.open.id}`);
      await screen.findByTestId('viewer-counter');
      expect(await axeViolations(container)).toEqual([]);
      unmount();
    }
  });
});

describe('карточка документа с ограниченным доступом (F-043, U14)', () => {
  it('только условия доступа: нет просмотрщика, расшифровки и запроса страниц', async () => {
    const { container } = renderAt(RESTRICTED);
    expect(await screen.findByRole('heading', { level: 1, name: '[Синтетика] Личные дела работников маслозавода' })).toBeInTheDocument();
    const notice = screen.getByTestId('restricted-notice');
    expect(within(notice).getByRole('heading', { name: 'Доступ ограничен' })).toBeInTheDocument();
    expect(within(notice).getByText(/персональные данные/)).toBeInTheDocument();
    expect(within(notice).getByRole('link', { name: 'Как работает читальный зал' })).toHaveAttribute('href', '/ru/visitors');
    expect(screen.queryByRole('region', { name: 'Изображение страницы' })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Расшифровка текста')).toBeNull();
    expect(screen.queryByText('Цифровая копия')).toBeNull();
    expect(requested().some((u) => u.includes('/pages'))).toBe(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('закрытый, несуществующий или неверный id — страница 404', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const { unmount } = renderAt(`/ru/catalog/documents/${id}`);
      expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeInTheDocument();
      unmount();
    }
  });
});

describe('переход из выдачи', () => {
  it('карточка в каталоге ведёт на страницу документа', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/ru/catalog');
    await user.click(await screen.findByRole('link', { name: '[Синтетика] Протокол заседания правления маслозавода' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(OPEN));
    expect(await screen.findByTestId('archive-code')).toHaveTextContent('Ф. TEST-1. Оп. 1. Д. 1.');
  });
});
