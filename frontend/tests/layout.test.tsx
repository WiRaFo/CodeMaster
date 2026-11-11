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
    expect(await screen.findByRole('heading', { level: 1, name: 'Цифровая память Восточного Казахстана' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('search', { name: 'Поиск по сайту и каталогу' })).toBeInTheDocument();
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
    expect(within(banner).getAllByRole('button', { name: 'Настройки доступности сайта' })[0]).toHaveAttribute('aria-expanded', 'false');
    expect(within(banner).queryByRole('button', { name: 'Остановить анимацию на сайте' })).toBeNull();
    expect(within(banner).getByRole('searchbox', { name: 'Поиск по сайту' })).toBeInTheDocument();
    // Переход к электронному каталогу — пункт меню с полным названием в подсказке (дизайн 11.11.2026).
    const nav = within(banner).getByRole('navigation', { name: 'Основные разделы' });
    expect(within(nav).getByRole('link', { name: 'Фонды и каталог' })).toHaveAttribute('href', '/ru/catalog');
    expect(within(nav).getByRole('link', { name: 'Фонды и каталог' })).toHaveAttribute('title', 'Фонды и электронный каталог');
  });

  it('меню содержит 10 разделов ТЗ §4 и раздел госуслуги из дополнения к ТЗ', async () => {
    renderAt('/en');
    const nav = await screen.findByRole('navigation', { name: 'Main sections' });
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/en', '/en/about', '/en/catalog', '/en/visitors', '/en/services', '/en/history', '/en/exhibitions', '/en/news', '/en/branches', '/en/faq', '/en/assistant',
    ]);
  });

  it('подвал показывает контакты из API без пометки о сверке', async () => {
    renderAt('/ru');
    const footer = screen.getByRole('contentinfo');
    expect(await within(footer).findByText(MAIN_BRANCH.address)).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: MAIN_BRANCH.phone })).toHaveAttribute('href', 'tel:87232255976');
    expect(within(footer).queryByText('Сведения перенесены с текущего сайта и уточняются')).toBeNull();
    expect(within(footer).getByText(/заявления, запросы и заказы через него не принимаются/)).toBeInTheDocument();
  });

  it('при ошибке API подвал сообщает об этом и даёт ссылку на филиалы', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderAt('/ru');
    expect(await within(screen.getByRole('contentinfo')).findByText('Контакты временно не загрузились.')).toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Все филиалы и контакты' })).toHaveAttribute('href', '/ru/branches');
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

async function openAccessMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = (await screen.findAllByRole('button', { name: 'Настройки доступности сайта' }))[0] as HTMLElement;
  await user.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return trigger;
}

describe('версия для слабовидящих', () => {
  it('кнопка в шапке включает режим, панель меняет размер и цвет, выход возвращает обычную версию', async () => {
    const user = userEvent.setup();
    const { container } = renderAt('/ru');
    const root = document.documentElement;
    await openAccessMenu(user);
    await user.click(screen.getByRole('button', { name: /Версия для слабовидящих/ }));
    expect(root.classList.contains('a11y')).toBe(true);
    const bar = screen.getByRole('region', { name: 'Настройки версии для слабовидящих' });
    await user.click(within(bar).getByRole('button', { name: 'Очень крупный' }));
    expect(root.classList.contains('a11y-xl')).toBe(true);
    await user.click(within(bar).getByRole('button', { name: /Белым по чёрному/ }));
    expect(root.classList.contains('a11y-wb')).toBe(true);
    expect(within(bar).getByRole('button', { name: /Белым по чёрному/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(bar).queryByRole('button', { name: 'Скрыть' })).toBeNull();
    await within(screen.getByRole('contentinfo')).findByText(MAIN_BRANCH.address);
    expect(await axeViolations(container)).toEqual([]);
    await user.click(within(bar).getByRole('button', { name: 'Обычная версия сайта' }));
    expect(root.classList.contains('a11y')).toBe(false);
    expect(root.classList.contains('a11y-wb')).toBe(false);
    expect(screen.queryByRole('region', { name: 'Настройки версии для слабовидящих' })).toBeNull();
  });

  it('меню доступности: размер текста, пауза анимации и сброс; Esc закрывает меню', async () => {
    const user = userEvent.setup();
    renderAt('/ru');
    const root = document.documentElement;
    const trigger = await openAccessMenu(user);
    await user.click(screen.getByRole('button', { name: 'Крупный' }));
    expect(root.classList.contains('txt-l')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Очень крупный' }));
    expect(root.classList.contains('txt-xl')).toBe(true);
    expect(root.classList.contains('txt-l')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Остановить анимацию' }));
    expect(root.classList.contains('no-motion')).toBe(true);
    expect(root.dataset['motion']).toBe('reduce');
    await user.click(screen.getByRole('button', { name: 'Сбросить настройки' }));
    expect(root.classList.contains('txt-xl')).toBe(false);
    expect(root.classList.contains('no-motion')).toBe(false);
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Настройки доступности сайта' })).toBeNull();
  });
});
