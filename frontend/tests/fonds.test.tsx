import { screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiMock, renderAt } from './render.tsx';

/** Навигация фонд → опись → дело (F-030), личные фонды и навигационная цепочка (дополнение к ТЗ §2; F-006). */
const FOND = {
  id: 'f1', number: 'TEST-5', archiveCode: { fond: 'TEST-5', formatted: 'Ф. TEST-5.' }, title: '[Синтетика] Личный фонд краеведа', annotation: null, historyNote: null,
  contentLang: 'ru', translationStatus: 'reviewed', kind: 'personal', years: { from: null, to: null }, unitsCount: null, isHighlighted: false, access: 'open',
  branch: { slug: 'main', name: 'ГА ВКО' }, dataOrigin: 'synthetic',
};
const CASE = {
  id: 'c1', number: '1', title: 'Рукописи и заметки', annotation: null, contentLang: 'ru', translationStatus: 'reviewed', dataOrigin: 'synthetic',
  archiveCode: { fond: 'TEST-5', inventory: '1', case: '1', formatted: 'Ф. TEST-5. Оп. 1. Д. 1.' }, date: { from: null, to: null, precision: 'year' }, sheetCount: 12, storageLocation: null, access: 'open',
  fond: { id: 'f1', number: 'TEST-5', title: FOND.title }, inventory: { id: 'i1', number: '1', title: 'Опись' }, documents: [],
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock({
    '/api/v1/catalog/fonds?': { items: [FOND], page: 1, pageSize: 20, total: 1, totalPages: 1 },
    '/api/v1/catalog/fonds/f1?': { ...FOND, inventories: [{ id: 'i1', number: '1', title: 'Опись', contentLang: 'ru', years: { from: null, to: null }, access: 'open' }] },
    '/api/v1/catalog/cases/c1?': CASE,
  }));
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('фонды', () => {
  it('личные фонды: фильтр по виду отмечен, запрос с kind=personal, ссылка на фонд', async () => {
    const { container } = renderAt('/ru/catalog/fonds?kind=personal');
    expect(await screen.findByRole('link', { name: /Личный фонд краеведа/ })).toHaveAttribute('href', '/ru/catalog/fonds/f1');
    expect(screen.getByRole('navigation', { name: 'Вид фонда' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Личные фонды', current: 'page' })).toBeInTheDocument();
    expect(vi.mocked(globalThis.fetch).mock.calls.some(([u]) => String(u).includes('kind=personal'))).toBe(true);
    const crumbs = screen.getByRole('navigation', { name: 'Навигационная цепочка' });
    expect(within(crumbs).getByRole('link', { name: 'Фонды и электронный каталог' })).toHaveAttribute('href', '/ru/catalog');
    expect(within(crumbs).getByText('Фонды')).toHaveAttribute('aria-current', 'page');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('фонд → описи; дело без документов — пояснение и полная цепочка', async () => {
    renderAt('/ru/catalog/fonds/f1');
    expect(await screen.findByRole('link', { name: 'Опись 1. Опись' })).toHaveAttribute('href', '/ru/catalog/inventories/i1');
    const { container } = renderAt('/ru/catalog/cases/c1');
    expect(await screen.findByText(/Описания документов этого дела на сайт ещё не внесены/)).toBeInTheDocument();
    const crumbs = within(container).getByRole('navigation', { name: 'Навигационная цепочка' });
    expect(within(crumbs).getByRole('link', { name: 'Опись 1' })).toHaveAttribute('href', '/ru/catalog/inventories/i1');
    expect(within(crumbs).getByText('Дело 1')).toHaveAttribute('aria-current', 'page');
  });

  it('страница раздела получает цепочку автоматически, главная — нет', async () => {
    renderAt('/en/faq');
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/en');
    renderAt('/ru');
    expect(screen.getAllByRole('navigation', { name: /цепочка|Breadcrumb/ })).toHaveLength(1);
  });
});
