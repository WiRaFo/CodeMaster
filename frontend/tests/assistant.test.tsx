import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { AssistantAnswer } from '../src/lib/types.ts';
import { apiMock, renderAt } from './render.tsx';

/** ЭТАП 12. Страница архивного помощника (ТЗ §5.8 А, Б; F-120–F-125). */
const SEARCH: AssistantAnswer = {
  intent: 'search',
  recognized: [
    { kind: 'years', yearFrom: 1960, yearTo: 1969, text: '1960-х' },
    { kind: 'settlement', value: 'ust-kamenogorsk', label: 'Усть-Каменогорск', text: 'усть-каменогорска' },
    { kind: 'type', value: 'photo', label: 'Фотографии', text: 'фотографии' },
  ],
  total: 1,
  catalogQuery: 'type=photo&settlement=ust-kamenogorsk&yearFrom=1960&yearTo=1969',
  requestedQuery: 'type=photo&settlement=ust-kamenogorsk&yearFrom=1960&yearTo=1969',
  dropped: [],
  documents: [{ id: '11111111-1111-4111-8111-111111111111', title: '[Синтетика] Фотография', code: 'Ф. TEST-1. Оп. 1. Д. 1.', date: { from: '1960-01-01', to: '1960-12-31' }, type: 'Фотографии', access: 'open', hasDigitalCopy: true, dataOrigin: 'synthetic' }],
  suggestions: [{ reason: 'prevDecade', query: 'type=photo&settlement=ust-kamenogorsk&yearFrom=1950&yearTo=1959' }],
};
const SERVICE: AssistantAnswer = { intent: 'service_request', links: ['visitors', 'branches'] };

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
    apiMock({ '/api/v1/assistant/ask?q=%D0%9A%D0%B0%D0%BA': SERVICE, '/api/v1/assistant/ask?': SEARCH }),
  );
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('архивный помощник', () => {
  it('пример ТЗ: распознанные условия, найденный документ со ссылкой, переход в каталог с фильтрами', async () => {
    const { container } = renderAt('/ru/assistant');
    await userEvent.type(screen.getByRole('textbox', { name: 'Ваш вопрос' }), 'Фотографии Усть-Каменогорска 1960-х');
    await userEvent.click(screen.getByRole('button', { name: 'Спросить' }));
    const answer = await screen.findByTestId('assistant-answer');
    await within(answer).findByText('Я понял запрос так:');
    expect(within(answer).getByTestId('recognized')).toHaveTextContent('Годы: 1960–1969Населённый пункт: Усть-КаменогорскТип: Фотографии');
    expect(within(answer).getByRole('link', { name: 'Ф. TEST-1. Оп. 1. Д. 1. — [Синтетика] Фотография' })).toHaveAttribute('href', '/ru/catalog/documents/11111111-1111-4111-8111-111111111111');
    expect(within(answer).queryByText('Тестовые данные')).toBeNull();
    expect(within(answer).getByRole('link', { name: 'Все результаты в каталоге' })).toHaveAttribute('href', '/ru/catalog?type=photo&settlement=ust-kamenogorsk&yearFrom=1960&yearTo=1969');
    expect(within(answer).getByRole('link', { name: 'Предыдущее десятилетие' })).toHaveAttribute('href', '/ru/catalog?type=photo&settlement=ust-kamenogorsk&yearFrom=1950&yearTo=1959');
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain(`/api/v1/assistant/ask?q=${encodeURIComponent('Фотографии Усть-Каменогорска 1960-х').replace(/%20/g, '+')}&lang=ru`);
    expect(screen.getByRole('textbox', { name: 'Ваш вопрос' })).toHaveValue('');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('модель ИИ подключена: под ответом правил — документы, похожие по смыслу', async () => {
    fetchMock.mockImplementation(apiMock({
      '/api/v1/assistant/ask?': {
        ...SEARCH,
        semantic: [{ id: '22222222-2222-4222-8222-222222222222', title: '[Синтетика] Вид набережной', code: 'Ф. TEST-1. Оп. 1. Д. 3.', date: { from: '1962-01-01', to: '1962-12-31' }, type: 'Фотографии', access: 'open', hasDigitalCopy: true, dataOrigin: 'synthetic' }],
      },
    }));
    const { container } = renderAt('/ru/assistant?q=набережная');
    const answer = await screen.findByTestId('assistant-answer');
    const list = await within(answer).findByRole('list', { name: 'Похожие по смыслу' });
    expect(within(list).getByRole('link', { name: 'Ф. TEST-1. Оп. 1. Д. 3. — [Синтетика] Вид набережной' })).toHaveAttribute('href', '/ru/catalog/documents/22222222-2222-4222-8222-222222222222');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('без модели блока «Похожие по смыслу» нет', async () => {
    renderAt('/ru/assistant?q=фото');
    await screen.findByTestId('assistant-answer');
    await screen.findByText('Я понял запрос так:');
    expect(screen.queryByRole('list', { name: 'Похожие по смыслу' })).toBeNull();
  });

  it('вопрос о заявлении: объяснение, что сайт справочный, и ссылки на разделы; пример вопроса задаётся кнопкой', async () => {
    renderAt('/ru/assistant');
    await userEvent.click(screen.getByRole('button', { name: 'Как подать заявление на архивную справку?' }));
    const answer = await screen.findByTestId('assistant-answer');
    expect(await within(answer).findByText(/заявления, запросы, заказы и оплата через него не принимаются/)).toBeInTheDocument();
    expect(within(answer).getByRole('link', { name: 'Посетителям' })).toHaveAttribute('href', '/ru/visitors');
    expect(within(answer).getByRole('link', { name: 'Филиалы и контакты' })).toHaveAttribute('href', '/ru/branches');
  });

  it('вопрос из адреса (?q=) задаётся сразу; ответ на английском интерфейсе', async () => {
    renderAt('/en/assistant?q=photos');
    const answer = await screen.findByTestId('assistant-answer');
    await waitFor(() => expect(within(answer).getByText('I understood your request as:')).toBeInTheDocument());
    expect(within(answer).getByText('Documents found: 1.')).toBeInTheDocument();
  });

  it('при ограничении частоты — понятное сообщение', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'x' } }), { status: 429 }));
    renderAt('/ru/assistant?q=test');
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много вопросов. Повторите через минуту.');
  });
});
