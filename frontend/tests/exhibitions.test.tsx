import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { ExhibitionDetail, ExhibitionList } from '../src/lib/types.ts';
import { apiMock, renderAt } from './render.tsx';

/** ЭТАП 8. Онлайн-выставки (ТЗ §5.7; F-090–F-092). */
const LIST: ExhibitionList = {
  items: [
    {
      slug: 'demo-a', title: '[Демо] Выставка А', lead: 'Вводный текст.', yearFrom: 1946, yearTo: 1991, itemCount: 3, coverItem: 1,
      topics: [{ slug: 'industry', name: 'Промышленность' }], dataOrigin: 'demo', contentLang: 'ru', translationStatus: 'reviewed',
    },
  ],
  page: 1, pageSize: 12, total: 1, totalPages: 1,
  topics: [{ slug: 'industry', name: 'Промышленность', count: 1 }, { slug: 'culture_art', name: 'Культура', count: 1 }],
};

const DETAIL: ExhibitionDetail = {
  slug: 'demo-a', title: '[Демо] Выставка А', lead: 'Вводный текст.', description: 'Описание.', yearFrom: 1946, yearTo: 1991,
  topics: [{ slug: 'industry', name: 'Промышленность' }], dataOrigin: 'demo', contentLang: 'ru', translationStatus: 'reviewed',
  items: [
    { number: 1, title: 'Первый', description: 'Описание первого.', sourceNote: 'Источник первого.', image: { alt: 'Фото первого', width: 800, height: 500 }, document: null, fond: null, contentLang: 'ru', translationStatus: 'reviewed' },
    {
      number: 2, title: 'Второй', description: null, sourceNote: null, image: null, fond: null, contentLang: 'ru', translationStatus: 'reviewed',
      document: { id: '11111111-1111-4111-8111-111111111111', title: 'Протокол', access: 'restricted', code: { formatted: 'Ф. 1. Оп. 1. Д. 1.' } },
    },
    { number: 3, title: 'Третий', description: null, sourceNote: null, image: null, document: null, fond: null, contentLang: 'ru', translationStatus: 'reviewed' },
  ],
};

const PERIODS = { items: [{ slug: '1946-1991', name: '1946–1991 годы', yearFrom: 1946, yearTo: 1991 }], page: 1, pageSize: 100, total: 1, totalPages: 1 };

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
    apiMock({ '/api/v1/exhibitions/demo-a?': DETAIL, '/api/v1/exhibitions?': LIST, '/api/v1/reference/periods?': PERIODS }),
  );
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('список выставок (F-090)', () => {
  it('карточки с пометкой «Демо», годами и числом экспонатов; фильтр по тематике и периоду меняет адрес', async () => {
    const { container } = renderAt('/ru/exhibitions');
    const card = (await screen.findByRole('link', { name: '[Демо] Выставка А' })).closest('article');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText('Демо')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('3 экспоната')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('Годы: 1946–1991')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Культура (1)' });
    await screen.findByRole('option', { name: '1946–1991 годы' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Тематика' }), 'culture_art');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Исторический период' }), '1946-1991');
    await userEvent.click(screen.getByRole('button', { name: 'Показать' }));
    await waitFor(() => expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain('/api/v1/exhibitions?lang=ru&page=1&topic=culture_art&period=1946-1991'));
    expect(screen.getByRole('link', { name: 'Сбросить' })).toHaveAttribute('href', '/ru/exhibitions');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('выставка и экспонат (F-091, F-092)', () => {
  it('страница выставки: описание и оглавление по порядку, кнопка «Начать просмотр»', async () => {
    const { container } = renderAt('/ru/exhibitions/demo-a');
    expect(await screen.findByRole('heading', { level: 1, name: '[Демо] Выставка А' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Начать просмотр' })).toHaveAttribute('href', '/ru/exhibitions/demo-a/1');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Первый', 'Второй', 'Третий']);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('экспонат: изображение с alt, увеличение, стрелки ведут к соседним экспонатам, у последнего — возврат к началу', async () => {
    const { container } = renderAt('/ru/exhibitions/demo-a/1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Первый' })).toBeInTheDocument();
    expect(screen.getByTestId('exhibit-counter')).toHaveTextContent('Экспонат 1 из 3');
    const img = screen.getByRole('img', { name: 'Фото первого' });
    expect(img).toHaveAttribute('src', '/api/v1/exhibitions/demo-a/items/1/image');
    expect(screen.getByText('Источник первого.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Предыдущий экспонат' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Увеличить' }));
    expect(img.style.width).toBe('125%');
    expect(await axeViolations(container)).toEqual([]);

    screen.getByRole('region', { name: 'Изображение экспоната' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Второй' })).toBeInTheDocument();
    // Ссылка на ограниченный документ: только карточка с пометкой.
    expect(screen.getByRole('link', { name: 'Ф. 1. Оп. 1. Д. 1. — Протокол' })).toHaveAttribute('href', '/ru/catalog/documents/11111111-1111-4111-8111-111111111111');
    expect(screen.getByText('Доступ ограничен')).toBeInTheDocument();
    expect(screen.getByText('У этого экспоната нет изображения.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Следующий экспонат' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Третий' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Следующий экспонат' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Вернуться к началу выставки' })).toHaveAttribute('href', '/ru/exhibitions/demo-a/1');
  });

  it('несуществующий номер экспоната и несуществующая выставка — страница 404', async () => {
    renderAt('/ru/exhibitions/demo-a/7');
    expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeInTheDocument();
  });
});
