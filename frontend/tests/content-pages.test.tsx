import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { PublicationDetail, PublicationList } from '../src/lib/types.ts';
import { apiMock, renderAt } from './render.tsx';

/** ЭТАП 7. Цифровая история, вопросы и ответы, отзывы, «Посетителям», «Об архиве». */
const STORY = {
  slug: 'demo-a', kind: 'article', title: '[Демо] Как читать шифр', lead: 'Шифр указывает фонд.', periodText: null, yearFrom: null, yearTo: null,
  publishedAt: '2026-11-09T00:00:00.000Z', topics: [{ slug: 'region', name: 'История области' }], settlements: [], dataOrigin: 'demo' as const, contentLang: 'ru', translationStatus: 'reviewed',
};
const LIST: PublicationList = {
  items: [STORY], page: 1, pageSize: 12, total: 1, totalPages: 1,
  topics: [{ slug: 'region', name: 'История области', count: 1 }, { slug: 'military', name: 'Военная история', count: 0 }],
};
const DETAIL: PublicationDetail = {
  ...STORY, bodyText: 'Первый абзац.\n\nВторой абзац.', sourceNote: 'Демонстрационный материал.', authorship: 'Команда (демо)', sourceUrl: null,
  document: { id: '11111111-1111-4111-8111-111111111111', title: 'Протокол', access: 'restricted', code: { formatted: 'Ф. 1. Оп. 1. Д. 1.' } },
  related: [],
};
const FAQ = { items: [{ id: 'f1', question: 'Можно ли подать заявление через сайт?', answer: 'Нет. Сайт справочный.', dataOrigin: 'demo', contentLang: 'ru', translationStatus: 'reviewed' }] };

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
    apiMock({ '/api/v1/history/demo-a?': DETAIL, '/api/v1/history?': LIST, '/api/v1/faq?': FAQ, '/api/v1/reference/periods?': { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
  );
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('цифровая история региона (F-080–F-084)', () => {
  it('тематики ТЗ: с публикациями — ссылки, без публикаций — «скоро»; карточка публикации с пометкой «Демо»', async () => {
    const { container } = renderAt('/ru/history');
    expect(await screen.findByRole('link', { name: /История области/ })).toHaveAttribute('href', '/ru/history?topic=region');
    expect(screen.getByText('Военная история').closest('span')?.parentElement).toHaveTextContent('скоро');
    expect(screen.queryByRole('link', { name: /Военная история/ })).toBeNull();
    const card = screen.getByRole('link', { name: '[Демо] Как читать шифр' }).closest('article') as HTMLElement;
    expect(within(card).getByText('Демо')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('публикация: абзацы текста, тематика, документ каталога с пометкой доступа, источник', async () => {
    const { container } = renderAt('/ru/history/demo-a');
    expect(await screen.findByRole('heading', { level: 1, name: '[Демо] Как читать шифр' })).toBeInTheDocument();
    expect(screen.getByText('Первый абзац.')).toBeInTheDocument();
    expect(screen.getByText('Второй абзац.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ф. 1. Оп. 1. Д. 1. — Протокол' })).toHaveAttribute('href', '/ru/catalog/documents/11111111-1111-4111-8111-111111111111');
    expect(screen.getByText('Доступ ограничен')).toBeInTheDocument();
    expect(screen.getByText('Демонстрационный материал.')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('вопросы и ответы', () => {
  it('вопрос раскрывается, есть пометка о согласовании и ссылки на помощника и отзывы', async () => {
    const { container } = renderAt('/ru/faq');
    const summary = await screen.findByText('Можно ли подать заявление через сайт?');
    await userEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByText('Ответы подготовлены командой разработки и будут согласованы с архивом.')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Отзывы и предложения' })).toHaveAttribute('href', '/ru/feedback');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('отзывы и предложения', () => {
  it('ошибки перечисляются в сводке, получающей фокус; почта без согласия не отправляется', async () => {
    const { container } = renderAt('/ru/feedback');
    expect(screen.getByText(/Это не обращение и не заявление/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: /Электронная почта/ }), 'a@example.kz');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(within(alert).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Выберите тему.', 'Сообщение должно быть не короче 10 символов.', 'Если указана почта, нужно согласие на её обработку.',
    ]);
    expect(screen.getByRole('combobox', { name: 'Тема' })).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/v1/feedback')).toBe(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('корректный отзыв отправляется; после ответа 202 — подтверждение', async () => {
    fetchMock.mockImplementation(async (input) => (String(input) === '/api/v1/feedback' ? new Response('{"accepted":true}', { status: 202 }) : new Response('{}', { status: 200 })));
    renderAt('/ru/feedback');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Тема' }), 'catalog');
    await userEvent.type(screen.getByRole('textbox', { name: /Сообщение/ }), 'Не нашёл фильтр по годам');
    await userEvent.type(screen.getByRole('textbox', { name: /Электронная почта/ }), 'a@example.kz');
    await userEvent.click(screen.getByRole('checkbox', { name: /Согласен на обработку/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByText('Спасибо! Отзыв отправлен.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/v1/feedback');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ topic: 'catalog', message: 'Не нашёл фильтр по годам', contactEmail: 'a@example.kz', consent: true, website: '', lang: 'ru' });
  });
});

describe('«Посетителям» и «Об архиве»', () => {
  it('контакты и режим читального зала берутся из реестра подразделений; правила не выдумываются', async () => {
    const { container } = renderAt('/ru/visitors');
    expect(await screen.findByText('Читальный зал: пн–пт, 10:00–17:00')).toBeInTheDocument();
    expect(screen.getByText(/Правила читального зала и перечень услуг архива будут опубликованы/)).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText(/заявления, запросы и заказы через него не принимаются/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('«Об архиве» показывает историю от архива с пометкой языка и ссылки на соцсети', async () => {
    const { container } = renderAt('/en/about');
    expect(await screen.findByText(/образован в 1940 году/)).toBeInTheDocument();
    expect(screen.getByText(/This text is available only in/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '@arhiv_vko' })).toHaveAttribute('href', 'https://www.instagram.com/arhiv_vko/');
    expect(screen.getByRole('link', { name: 'Archive structure and management' })).toHaveAttribute('href', '/en/about/structure');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('«Структура» группирует сотрудников по отделам', async () => {
    const { container } = renderAt('/en/about/structure');
    expect(await screen.findByRole('heading', { level: 2, name: 'Management' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Information Technology Department' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '8 (7232) 25-13-22' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('«Календарь памятных дат»', () => {
  it('годы — ссылки, текущий отмечен; записи по месяцам, юбилеи без даты в конце; английская версия с пометкой языка', async () => {
    const { container } = renderAt('/en/calendar');
    expect(await screen.findByRole('heading', { level: 2, name: 'January' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Anniversaries of the year without an exact date' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2026' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '2025' })).toHaveAttribute('href', '/en/calendar?year=2025');
    expect(screen.getByText(/This text is available only in/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });
});

