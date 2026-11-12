import { screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionDetail, DocumentSummary } from '../src/lib/types.ts';
import { apiMock, FIXTURES, renderAt } from './render.tsx';

const BASE = { dataOrigin: 'demo', contentLang: 'ru', translationStatus: 'reviewed' } as const;
const DETAIL: CollectionDetail = {
  ...BASE, slug: 'demo-creamery-records', title: '[Демо] Маслозавод в документах', description: 'Пример подборки.', itemCount: 3,
  documents: FIXTURES.catalog.items.map((d): DocumentSummary => ({ ...d, access: d.access === 'restricted' ? 'restricted' : 'open', dataOrigin: 'synthetic' })),
  persons: [{ slug: 'burov-pavel', fullName: 'Буров Павел Петрович', lifeYears: '1902–1944', contentLang: 'ru' }],
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock({
    '/api/v1/history/collections?': { items: [DETAIL] },
    '/api/v1/history/collections/demo-creamery-records?': DETAIL,
  }));
});

describe('коллекции «Архива памяти» (F-081)', () => {
  it('список: пометка «Демо», число материалов, переход в коллекцию', async () => {
    const { container } = renderAt('/ru/history/collections');
    const link = await screen.findByRole('link', { name: '[Демо] Маслозавод в документах' });
    expect(link).toHaveAttribute('href', '/ru/history/collections/demo-creamery-records');
    const card = link.closest('article') as HTMLElement;
    expect(within(card).getByText('Демо')).toBeInTheDocument();
    expect(within(card).getByText('3 материала')).toBeInTheDocument();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it('коллекция: документы карточками каталога с пометкой доступа, личности ссылками', async () => {
    const { container } = renderAt('/ru/history/collections/demo-creamery-records');
    expect(await screen.findByRole('heading', { level: 1, name: '[Демо] Маслозавод в документах' })).toBeInTheDocument();
    const docs = screen.getByRole('region', { name: 'Документы' });
    expect(within(docs).getAllByRole('link')).toHaveLength(2);
    expect(within(docs).getByText('Доступ ограничен')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Исторические личности' })).getByRole('link', { name: /Буров/ })).toHaveAttribute('href', '/ru/history/persons/burov-pavel');
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});
