import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { apiMock, renderAt } from './render.tsx';

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock());
});

const calls = (prefix: string) => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith(prefix));
const lastParams = (prefix: string) => new URLSearchParams(calls(prefix).at(-1)?.split('?')[1] ?? '');

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('каталог: фильтры и фасеты (ЭТАП 5)', () => {
  it('фасеты показаны группами с числом документов; выбор фильтра меняет адрес и запросы к API', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/ru/catalog?q=протокол');
    const aside = screen.getByRole('complementary', { name: 'Фильтры' });
    const settlements = await within(aside).findByRole('group', { name: 'Населённый пункт' });
    const ridder = within(settlements).getByRole('checkbox', { name: /Риддер/ });
    expect(ridder.closest('label')).toHaveTextContent('Риддер1');
    await user.click(ridder);
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).getAll('settlement')).toEqual(['ridder']));
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('протокол');
    await waitFor(() => expect(lastParams('/api/v1/catalog/documents?').get('settlement')).toBe('ridder'));
    expect(lastParams('/api/v1/catalog/facets?').get('settlement')).toBe('ridder');
    expect(lastParams('/api/v1/catalog/facets?').get('page')).toBeNull();
    // Фокус остаётся на флажке: смена фильтра не считается переходом на другую страницу.
    expect(within(aside).getByRole('checkbox', { name: /Риддер/ })).toHaveFocus();
  });

  it('выбранные фильтры видны кнопками, каждый снимается отдельно, есть сброс всех', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/ru/catalog?type=photo&access=restricted&yearFrom=1950&yearTo=1960');
    const remove = await screen.findByRole('button', { name: 'Убрать фильтр «Тип документа: Фотодокументы»' });
    expect(screen.getByRole('button', { name: 'Убрать фильтр «Уровень доступа: Ограниченный доступ»' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Убрать фильтр «Годы: 1950–1960»' })).toBeInTheDocument();
    await user.click(remove);
    await waitFor(() => expect(router.state.location.search).toBe('?access=restricted&yearFrom=1950&yearTo=1960'));
    await user.click(screen.getAllByRole('button', { name: 'Сбросить все фильтры' })[0] as HTMLElement);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('годы: проверка ввода с понятным сообщением, применение по кнопке', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/ru/catalog');
    const aside = screen.getByRole('complementary', { name: 'Фильтры' });
    const from = within(aside).getByRole('textbox', { name: 'С года' });
    const to = within(aside).getByRole('textbox', { name: 'До года (включительно)' });
    await user.type(from, '1990');
    await user.type(to, '1950');
    await user.click(within(aside).getByRole('button', { name: 'Применить' }));
    expect(within(aside).getByRole('alert')).toHaveTextContent('Начальный год должен быть не больше конечного.');
    expect(from).toHaveAttribute('aria-invalid', 'true');
    await user.clear(to);
    await user.type(to, '1995');
    await user.click(within(aside).getByRole('button', { name: 'Применить' }));
    await waitFor(() => expect(router.state.location.search).toBe('?yearFrom=1990&yearTo=1995'));
  });

  it('сортировка: по релевантности только при запросе, выбор пишется в адрес', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/ru/catalog');
    const sort = screen.getByRole('combobox', { name: 'Сортировка' });
    expect(within(sort).queryByRole('option', { name: 'По релевантности' })).toBeNull();
    await user.selectOptions(sort, 'Сначала поздние');
    await waitFor(() => expect(router.state.location.search).toBe('?sort=date_desc'));
    await waitFor(() => expect(lastParams('/api/v1/catalog/documents?').get('sort')).toBe('date_desc'));
  });

  it('новый запрос сохраняет выбранные фильтры', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/ru/catalog?type=photo');
    const box = screen.getByRole('searchbox', { name: 'Поиск в электронном каталоге' });
    await user.type(box, 'коллектив{Enter}');
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('q')).toBe('коллектив'));
    expect(new URLSearchParams(router.state.location.search).get('type')).toBe('photo');
  });

  it('на узком экране фильтры открываются в диалоге; ?filters=open открывает его сразу', async () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('max-width'), media: q, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }) as MediaQueryList,
    );
    const user = userEvent.setup();
    renderAt('/ru/catalog?filters=open');
    const dialog = await screen.findByRole('dialog', { name: 'Фильтры' });
    await within(dialog).findByRole('group', { name: 'Тип документа' });
    expect(await within(dialog).findByRole('button', { name: 'Показать 2 документа' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Показать 2 документа' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Фильтры' })).toHaveFocus();
    matchMedia.mockRestore();
  });

  it('нет нарушений axe с выбранными фильтрами', async () => {
    const { container } = renderAt('/ru/catalog?q=протокол&type=photo&hasDigitalCopy=true');
    await screen.findByRole('group', { name: 'Тип документа' });
    await screen.findByText(/По запросу «протокол»/);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('каталог: смысловой поиск (D-023)', () => {
  const SEMANTIC_DOC = {
    id: '9f1c2b3a-0000-4000-8000-000000000001', title: '[Синтетика] Отчёт о выпуске сливочного масла', contentLang: 'ru', translationStatus: 'reviewed',
    archiveCode: { fond: 'TEST-1', inventory: '1', case: '2', formatted: 'Ф. TEST-1. Оп. 1. Д. 2.' }, documentNumber: '5',
    date: { from: '1958-01-01', to: '1958-12-31', precision: 'year' }, type: { code: 'organization_record', name: 'Документы организаций и предприятий' },
    branch: { slug: 'main', name: 'ГА ВКО' }, access: 'open', hasDigitalCopy: false, dataOrigin: 'synthetic', highlight: null, score: 0.71,
  };

  it('модель подключена: блок «Похожие по смыслу» под выдачей, без повторов основной выдачи', async () => {
    fetchMock.mockImplementation(apiMock({
      '/api/v1/catalog/semantic?': { available: true, model: 'bge-m3', items: [SEMANTIC_DOC, { ...SEMANTIC_DOC, id: '6b8741a3-8fc6-40af-9408-21b6f9709b6f', title: 'Повтор' }] },
    }));
    const { container } = renderAt('/ru/catalog?q=масло');
    const block = await screen.findByRole('region', { name: 'Похожие по смыслу' });
    expect(within(block).getByRole('link', { name: '[Синтетика] Отчёт о выпуске сливочного масла' })).toHaveAttribute('href', `/ru/catalog/documents/${SEMANTIC_DOC.id}`);
    expect(within(block).queryByRole('link', { name: 'Повтор' })).toBeNull();
    expect(lastParams('/api/v1/catalog/semantic?').get('q')).toBe('масло');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('модель не подключена или не ответила: блока нет, обычная выдача на месте', async () => {
    fetchMock.mockImplementation(apiMock({ '/api/v1/catalog/semantic?': { available: false, model: null, items: [] } }));
    renderAt('/ru/catalog?q=масло');
    expect(await screen.findByRole('link', { name: '[Синтетика] Ведомость' })).toBeInTheDocument();
    await waitFor(() => expect(calls('/api/v1/catalog/semantic?')).toHaveLength(1));
    expect(screen.queryByRole('region', { name: 'Похожие по смыслу' })).toBeNull();
  });

  it('без запроса смысловой поиск не вызывается', async () => {
    renderAt('/ru/catalog');
    await screen.findByRole('link', { name: '[Синтетика] Ведомость' });
    expect(calls('/api/v1/catalog/semantic?')).toHaveLength(0);
  });
});
