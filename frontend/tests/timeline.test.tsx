import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineEvent } from '../src/lib/types.ts';
import { apiMock, renderAt } from './render.tsx';

const NO_PUBLICATIONS: TimelineEvent['publications'] = [];
const BASE = { publications: NO_PUBLICATIONS, precision: 'year', sourceNote: 'Текст «История архива», передан архивом 10.11.2026', dataOrigin: 'verified', contentLang: 'ru', translationStatus: 'reviewed' } as const;
const EVENTS: TimelineEvent[] = [
  { ...BASE, slug: 'founded', year: 1940, date: null, title: 'Образован архив', description: 'Архив образован в 1940 году.', publications: [{ slug: 'pub-a', title: 'Как читать шифр' }] },
  { ...BASE, slug: 'renamed', year: 1941, date: '1941-10-31', precision: 'day', title: 'Переименование', description: 'Приказ от 31 октября 1941 года.' },
  { ...BASE, slug: 'network', year: 1967, date: null, title: 'Сеть сформирована', description: 'Сеть состояла из:\n— Архивного отдела\n— Госархива области' },
];

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock({ '/api/v1/history/timeline?': { items: EVENTS, documentsByYear: { '1967': 2 } } }));
});

describe('интерактивная хронология (F-087, D-020)', () => {
  it('шкала, список и карточка события; выбор десятилетия, поиск, переход стрелками; связанные материалы', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/ru/history/timeline');
    expect(await screen.findByRole('heading', { level: 1, name: 'Хронология' })).toBeInTheDocument();
    // По умолчанию выбрано первое событие, в карточке — публикация о нём и документы десятилетия.
    expect(screen.getByRole('heading', { level: 2, name: 'Образован архив' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Как читать шифр' })).toHaveAttribute('href', '/ru/history/pub-a');
    expect(screen.getByRole('link', { name: 'Документы 1940-х годов в каталоге' })).toHaveAttribute('href', '/ru/catalog?yearFrom=1940&yearTo=1949');
    expect(screen.getByText('Событий: 3')).toBeInTheDocument();

    // Отметка на шкале выбирает событие; точная дата показана, где известна.
    await user.click(within(screen.getByRole('group', { name: 'Шкала времени: отметки событий' })).getByRole('button', { name: '1941: Переименование' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Переименование' })).toBeInTheDocument();
    expect(screen.getByText('31 октября 1941 г.').closest('time')).toHaveAttribute('dateTime', '1941-10-31');

    // «Позже» — следующее событие; в 1967 году два документа каталога.
    await user.click(screen.getByRole('button', { name: /Позже/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Сеть сформирована' })).toBeInTheDocument();
    expect(screen.getByText('Архивного отдела')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2 документа 1967 года в каталоге' })).toHaveAttribute('href', '/ru/catalog?yearFrom=1967&yearTo=1967');

    // Десятилетие сужает список; поиск — тоже.
    await user.click(screen.getByRole('button', { name: '1940-е' }));
    expect(screen.getByText('Событий: 2')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'События выбранного периода' })).getAllByRole('listitem')).toHaveLength(2);
    await user.type(screen.getByRole('searchbox', { name: 'Найти событие' }), 'переимен');
    expect(screen.getByText('Событий: 1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Переименование' })).toBeInTheDocument();

    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  it('на казахском показан русский текст с пометкой языка', async () => {
    renderAt('/kk/history/timeline');
    expect(await screen.findByRole('heading', { level: 2, name: 'Образован архив' })).toBeInTheDocument();
    expect(screen.getByText('Мәтін тек мына тілде қолжетімді: Русский')).toBeInTheDocument();
  });
});
