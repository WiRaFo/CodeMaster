import { screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimelineEvent } from '../src/lib/types.ts';
import { apiMock, renderAt } from './render.tsx';

const BASE = { precision: 'year', sourceNote: 'Текст «История архива», передан архивом 10.11.2026', dataOrigin: 'verified', contentLang: 'ru', translationStatus: 'reviewed' } as const;
const EVENTS: TimelineEvent[] = [
  { ...BASE, slug: 'founded', year: 1940, date: null, title: 'Образован архив', description: 'Архив образован в 1940 году.' },
  { ...BASE, slug: 'renamed', year: 1941, date: '1941-10-31', precision: 'day', title: 'Переименование', description: 'Приказ от 31 октября 1941 года.' },
  { ...BASE, slug: 'network', year: 1967, date: null, title: 'Сеть сформирована', description: 'Сеть состояла из:\n— Архивного отдела\n— Госархива области' },
];

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock({ '/api/v1/history/timeline?': { items: EVENTS } }));
});

describe('хронологическая лента (F-083)', () => {
  it('события по десятилетиям, точная дата где известна, переход по десятилетиям ссылками', async () => {
    const { container } = renderAt('/ru/history/timeline');
    expect(await screen.findByRole('heading', { level: 1, name: 'Хронология' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Десятилетия' });
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['1940-е', '#decade-1940'], ['1960-е', '#decade-1960']]);
    const forties = screen.getByRole('region', { name: '1940-е' });
    expect(within(forties).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Образован архив', 'Переименование']);
    expect(within(forties).getByText('31 октября 1941 г.').closest('time')).toHaveAttribute('dateTime', '1941-10-31');
    expect(within(screen.getByRole('region', { name: '1960-е' })).getAllByRole('listitem').map((li) => li.textContent)).toContain('Архивного отдела');
    expect(screen.getByText(/передан архивом/)).toBeInTheDocument();
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  it('на казахском показан русский текст с пометкой языка', async () => {
    renderAt('/kk/history/timeline');
    expect(await screen.findByRole('heading', { level: 3, name: 'Образован архив' })).toBeInTheDocument();
    expect(screen.getByText('Мәтін тек мына тілде қолжетімді: Русский')).toBeInTheDocument();
  });
});
