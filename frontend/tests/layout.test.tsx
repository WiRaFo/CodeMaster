import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAIN_BRANCH, apiMock, renderAt } from './render.tsx';

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock());
});

async function axeViolations(container: HTMLElement) {
  // В jsdom нет вычисления стилей: контраст проверяется отдельно (contrast.test.ts) и в e2e.
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('каркас страницы', () => {
  it('ориентиры, один h1, язык страницы и заголовок вкладки', async () => {
    renderAt('/ru');
    expect(await screen.findByRole('heading', { level: 1, name: 'Государственный архив Восточно-Казахстанской области' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Поиск по сайту' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Основные разделы' })).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('ru'));
    expect(document.title).toBe('Государственный архив Восточно-Казахстанской области — Госархив ВКО');
  });

  it('первый элемент в порядке Tab — ссылка «Перейти к основному содержимому»', async () => {
    renderAt('/ru');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.tab();
    expect(document.activeElement).toHaveTextContent('Перейти к основному содержимому');
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('шапка содержит обязательные элементы ТЗ §4', async () => {
    renderAt('/ru');
    const banner = screen.getByRole('banner');
    expect(within(banner).getByRole('link', { name: 'Госархив ВКО — на главную' })).toHaveAttribute('href', '/ru');
    const langs = within(banner).getByRole('navigation', { name: 'Язык сайта' });
    expect(within(langs).getAllByRole('link').map((a) => a.textContent)).toEqual(['KZ', 'RU', 'EN']);
    expect(within(langs).getByRole('link', { name: 'RU' })).toHaveAttribute('aria-current', 'true');
    expect(within(banner).getByRole('button', { name: 'Включить тёмную тему' })).toBeInTheDocument();
    expect(within(banner).getByRole('searchbox', { name: 'Поиск по сайту' })).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'Электронный каталог' })).toHaveAttribute('href', '/ru/catalog');
    // Панель «Доступность» убрана: режимы текста и контраста будут вариантами дизайна.
    expect(within(banner).queryByRole('button', { name: 'Доступность' })).toBeNull();
  });

  it('меню содержит 10 разделов ТЗ §4 и раздел госуслуги из дополнения к ТЗ', async () => {
    renderAt('/en');
    const nav = await screen.findByRole('navigation', { name: 'Main sections' });
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/en', '/en/about', '/en/catalog', '/en/visitors', '/en/services', '/en/history', '/en/exhibitions', '/en/news', '/en/branches', '/en/faq', '/en/assistant',
    ]);
  });

  it('подвал показывает контакты из API с пометкой о сверке', async () => {
    renderAt('/ru');
    const footer = screen.getByRole('contentinfo');
    expect(await within(footer).findByText(MAIN_BRANCH.address)).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: MAIN_BRANCH.phone })).toHaveAttribute('href', 'tel:87232255976');
    expect(within(footer).getByText('Сведения перенесены с текущего сайта и уточняются')).toBeInTheDocument();
    expect(within(footer).getByText(/заявления, запросы и заказы через него не принимаются/)).toBeInTheDocument();
  });

  it('при ошибке API подвал сообщает об этом и даёт ссылку на филиалы', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderAt('/ru');
    expect(await screen.findByText('Контакты временно не загрузились.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Все филиалы и контакты' })).toHaveAttribute('href', '/ru/branches');
  });

  it('переключатель языка ведёт на ту же страницу', async () => {
    renderAt('/ru/accessibility');
    const langs = await screen.findByRole('navigation', { name: 'Язык сайта' });
    expect(within(langs).getByRole('link', { name: 'KZ' })).toHaveAttribute('href', '/kk/accessibility');
    expect(within(langs).getByRole('link', { name: 'EN' })).toHaveAttribute('href', '/en/accessibility');
  });

  it('адрес без языка перенаправляется на казахскую версию по умолчанию', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE']);
    const { router } = renderAt('/catalog');
    await waitFor(() => expect(router.state.location.pathname).toBe('/kk/catalog'));
  });

  it('при переходе по ссылке фокус переходит на заголовок новой страницы', async () => {
    renderAt('/ru');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Основные разделы' })).getByRole('link', { name: 'Об архиве' }));
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Об архиве' });
    await waitFor(() => expect(document.activeElement).toBe(h1));
    expect(document.title).toBe('Об архиве — Госархив ВКО');
  });

  it.each(['/kk', '/ru/accessibility', '/en/catalog', '/ru/nonexistent'])('axe без нарушений: %s', async (path) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { level: 1 });
    await within(screen.getByRole('contentinfo')).findByText(MAIN_BRANCH.address);
    await waitFor(() => expect(container.querySelectorAll('[data-load-state="loading"]')).toHaveLength(0));
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('тема', () => {
  it('кнопка темы в шапке переключает светлую и тёмную тему', async () => {
    const user = userEvent.setup();
    renderAt('/ru');
    await user.click(await screen.findByRole('button', { name: 'Включить тёмную тему' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Включить светлую тему' }));
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
