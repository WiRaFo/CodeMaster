import { screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryItem } from '../src/lib/types.ts';
import { apiMock, FIXTURES, renderAt } from './render.tsx';

const [first] = FIXTURES.catalog.items;
const ITEM: GalleryItem | null = first
  ? { ...first, access: 'open', dataOrigin: 'synthetic', image: { url: `/api/v1/catalog/documents/${first.id}/pages/1/image`, width: 1240, height: 1754 } }
  : null;

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock({ '/api/v1/history/gallery?': { items: ITEM ? [ITEM] : [], page: 1, pageSize: 24, total: 1, totalPages: 1 } }));
});

describe('галерея (F-085)', () => {
  it('плитка: изображение с описанием, подпись с шифром и годом, переход к карточке документа', async () => {
    const { container } = renderAt('/ru/history/gallery');
    const img = await screen.findByRole('img', { name: 'Первая страница цифровой копии: [Синтетика] Протокол заседания правления маслозавода' });
    expect(img).toHaveAttribute('src', ITEM?.image.url);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img.closest('a')).toHaveAttribute('href', `/ru/catalog/documents/${ITEM?.id ?? ''}`);
    const figure = img.closest('figure') as HTMLElement;
    expect(within(figure).getByText('Ф. TEST-1. Оп. 1. Д. 1., 1956')).toBeInTheDocument();
    expect(within(figure).queryByText('Тестовые данные')).toBeNull();
    expect((await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});
