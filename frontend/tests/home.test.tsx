import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { apiMock, renderAt } from './render.tsx';

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock());
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('главная (ТЗ §5.1)', () => {
  it('первый экран с девизом и действиями, четыре быстрых перехода (дизайн 11.11.2026)', async () => {
    renderAt('/ru');
    const hero = within((await screen.findByRole('heading', { level: 1, name: 'Цифровая память Восточного Казахстана' })).closest('section') as HTMLElement);
    expect(hero.getByText('Государственный архив Восточно-Казахстанской области')).toBeInTheDocument();
    expect(hero.getByRole('link', { name: 'Найти архивный документ' })).toHaveAttribute('href', '/ru/catalog');
    expect(hero.getByRole('link', { name: 'Смотреть онлайн-выставки' })).toHaveAttribute('href', '/ru/exhibitions');
    expect(document.title).toBe('Государственный архив Восточно-Казахстанской области — Госархив ВКО');
    const b = within(screen.getByRole('heading', { level: 2, name: 'Быстрые переходы' }).closest('section') as HTMLElement);
    expect(b.getByRole('link', { name: /Найти архивный документ/ })).toHaveAttribute('href', '/ru/catalog');
    expect(b.getByRole('link', { name: /Как получить архивную справку/ })).toHaveAttribute('href', '/ru/services');
    expect(b.getByRole('link', { name: /Посетить читальный зал/ })).toHaveAttribute('href', '/ru/reading-room');
    expect(b.getByRole('link', { name: /Найти филиал/ })).toHaveAttribute('href', '/ru/branches');
  });

  it('«Полезная информация»: четыре перехода на рабочие страницы (F-016)', async () => {
    renderAt('/ru');
    const block = within((await screen.findByRole('heading', { level: 2, name: 'Полезная информация' })).closest('section') as HTMLElement);
    expect(block.getByRole('link', { name: /^Как пользоваться каталогом/ })).toHaveAttribute('href', '/ru/faq');
    expect(block.getByRole('link', { name: /^Как устроены фонды и описи/ })).toHaveAttribute('href', '/ru/catalog/fonds');
    expect(block.getByRole('link', { name: /^Что опубликовано/ })).toHaveAttribute('href', '/ru/catalog?hasDigitalCopy=true');
    expect(block.getByRole('link', { name: /^Сведения о филиалах/ })).toHaveAttribute('href', '/ru/branches');
  });

  it('блоки из API: история в документах, выставки, филиалы, новости; демо и тестовые данные помечены', async () => {
    renderAt('/ru');
    const history = (await screen.findByRole('heading', { level: 2, name: 'Цифровая история региона' })).closest('section') as HTMLElement;
    const h = within(history);
    expect(h.getByRole('link', { name: /Протокол заседания правления маслозавода/ })).toHaveAttribute(
      'href',
      '/ru/catalog/documents/6b8741a3-8fc6-40af-9408-21b6f9709b6f',
    );
    expect(h.getByText('Ф. TEST-1. Оп. 1. Д. 1.')).toBeInTheDocument();
    expect(h.getByText('Тестовые данные')).toBeInTheDocument();
    expect(h.getByRole('link', { name: /^История семьи и поколений/ })).toHaveAttribute('href', '/ru/history?topic=family');

    const news = screen.getByRole('heading', { level: 2, name: 'Новости и события' }).closest('section') as HTMLElement;
    expect(within(news).getByRole('link', { name: /\[Демо\] Прототип нового сайта архива/ })).toHaveAttribute('href', '/ru/news/demo-new-site-prototype');
    expect(within(news).getAllByText('Демо').length).toBeGreaterThan(0);
    expect(within(news).getByText('8 ноября 2026 г.')).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 2, name: 'Онлайн-выставки' })).toBeInTheDocument();
    const contacts = screen.getByRole('heading', { level: 2, name: 'Филиалы и контакты' }).parentElement as HTMLElement;
    expect(await within(contacts).findByText(/подразделени/)).toBeInTheDocument();
    expect(within(contacts).getByRole('link', { name: 'Найти филиал' })).toHaveAttribute('href', '/ru/branches');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/home?lang=ru', expect.anything());
  });

  it('памятные даты текущего месяца из календаря архива, со ссылкой на весь календарь', async () => {
    renderAt('/ru');
    const block = await screen.findByRole('region', { name: /^Памятные даты: / });
    expect(within(block).getByText(/Ефима Николаевича Пермитина/)).toBeInTheDocument();
    expect(within(block).getByRole('link', { name: /Весь календарь/ })).toHaveAttribute('href', '/ru/calendar');
    const month = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.startsWith('/api/v1/calendar?'));
    expect(month).toBe(`/api/v1/calendar?lang=ru&month=${new Date().getMonth() + 1}`);
  });

  it('без данных пустые блоки не показываются, при ошибке — понятное сообщение', async () => {
    fetchMock.mockImplementation(apiMock({ '/api/v1/home?': { news: [], exhibitions: [], history: { topics: [], publications: [], documents: [] } } }));
    renderAt('/ru');
    await screen.findByRole('heading', { level: 2, name: 'Филиалы и контакты' });
    await waitFor(() => expect(document.querySelector('[data-load-state="loading"]')).toBeNull());
    expect(screen.queryByRole('heading', { name: 'Новости и события' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Онлайн-выставки' })).toBeNull();
  });

  it('сообщает об ошибке загрузки', async () => {
    fetchMock.mockImplementation(async () => new Response('', { status: 502 }));
    renderAt('/ru');
    expect((await screen.findAllByText(/Не удалось загрузить данные/)).length).toBeGreaterThan(0);
  });

  it('поиск в каталоге с главной ведёт на выдачу с запросом в адресе (e2e 1)', async () => {
    const user = userEvent.setup();
    const { router } = renderAt('/ru');
    const form = await screen.findByRole('search', { name: 'Поиск в электронном каталоге' });
    await user.type(within(form).getByRole('searchbox'), 'протокол заседания');
    await user.click(within(form).getByRole('button', { name: 'Искать' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ru/catalog'));
    expect(new URLSearchParams(router.state.location.search).get('q')).toBe('протокол заседания');
    expect(await screen.findByText('По запросу «протокол заседания» найдено 2 документа')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/v1\/catalog\/documents\?q=%D0%BF.*&lang=ru&sort=relevance&page=1&pageSize=20$/), expect.anything());
  });

  it('нет нарушений axe на главной в трёх языках', async () => {
    for (const lang of ['kk', 'ru', 'en']) {
      const { container, unmount } = renderAt(`/${lang}`);
      await screen.findByRole('heading', { level: 2, name: { kk: 'Өңірдің цифрлық тарихы', ru: 'Цифровая история региона', en: 'Digital history of the region' }[lang] });
      await waitFor(() => expect(container.querySelectorAll('[data-load-state="loading"]').length).toBe(0));
      expect(await axeViolations(container)).toEqual([]);
      unmount();
    }
  });
});

describe('выдача каталога', () => {
  it('подсветка совпадений без внедрения HTML, пометка ограниченного доступа', async () => {
    const { container } = renderAt('/ru/catalog?q=заседания');
    const mark = await screen.findByText('заседания', { selector: 'mark' });
    expect(mark.tagName).toBe('MARK');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText(/Протокол <script>/)).toBeInTheDocument();
    expect(screen.getByText('Доступ ограничен')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Поиск в электронном каталоге' })).toHaveValue('заседания');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('новости', () => {
  it('несуществующая новость показывает страницу 404', async () => {
    renderAt('/ru/news/no-such-news');
    expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeInTheDocument();
  });

  it('пустая лента сообщает, что новостей нет', async () => {
    renderAt('/ru/news');
    expect(await screen.findByText('Новостей пока нет.')).toBeInTheDocument();
  });

  it('ответ старой версии API без рубрик: лента работает, рубрики не показываются', async () => {
    fetchMock.mockImplementation(apiMock({ '/api/v1/news?': { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 } }));
    renderAt('/ru/news');
    expect(await screen.findByText('Новостей пока нет.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Рубрики новостей' })).toBeNull();
  });

  it('поиск и рубрика попадают в адрес и в запрос к API; сброс возвращает всю ленту (F-101)', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/ru/news');
    const form = within(await screen.findByRole('search', { name: 'Поиск по новостям' }));
    await user.type(form.getByRole('searchbox', { name: 'Поиск по новостям' }), 'выставка');
    await user.click(form.getByRole('button', { name: 'Найти' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('q=%D0%B2%D1%8B%D1%81%D1%82%D0%B0%D0%B2%D0%BA%D0%B0'))).toBe(true));
    expect(await screen.findByText('По этому запросу новостей нет. Измените запрос или выберите другую рубрику.')).toBeInTheDocument();
    const rubrics = within(screen.getByRole('navigation', { name: 'Рубрики новостей' }));
    expect(rubrics.getByRole('link', { name: 'Все рубрики' })).toHaveAttribute('aria-current', 'true');
    await user.click(rubrics.getByRole('link', { name: 'Мероприятия (0)' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('rubric=events') && String(u).includes('q='))).toBe(true));
    expect(within(screen.getByRole('navigation', { name: 'Рубрики новостей' })).getByRole('link', { name: 'Мероприятия (0)' })).toHaveAttribute('aria-current', 'true');
    await user.click(screen.getByRole('link', { name: 'Сбросить' }));
    expect(await screen.findByText('Новостей пока нет.')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});
