import { screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonDetail } from '../src/lib/types.ts';
import { apiMock, renderAt } from './render.tsx';

const BASE = { dataOrigin: 'verified', contentLang: 'ru', translationStatus: 'reviewed' } as const;
const BUROV: PersonDetail = {
  ...BASE, slug: 'burov-pavel', fullName: 'Буров Павел Петрович', lifeYears: '1902–1944', biography: null, sourceNote: 'Календарь',
  memorableDates: [{ calendarYear: 2022, dateLabel: '4 марта', text: '120 лет со дня рождения геолога', contentLang: 'ru' }],
};

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(apiMock({
    '/api/v1/history/persons?': { items: [BUROV, { ...BASE, slug: 'chistyakov-mikhail', fullName: 'Чистяков Михаил Иванович', lifeYears: null }] },
    '/api/v1/history/persons/burov-pavel?': BUROV,
  }));
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => v.id);
}

describe('исторические личности (F-086)', () => {
  it('список ведёт на страницы, годы жизни только где известны', async () => {
    const { container } = renderAt('/ru/history/persons');
    const link = await screen.findByRole('link', { name: /Буров Павел Петрович/ });
    expect(link).toHaveAttribute('href', '/ru/history/persons/burov-pavel');
    expect(link).toHaveTextContent('1902–1944');
    expect(screen.getByRole('link', { name: 'Чистяков Михаил Иванович' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('страница: записи календаря, честная пометка об отсутствии биографии, источник', async () => {
    const { container } = renderAt('/ru/history/persons/burov-pavel');
    expect(await screen.findByRole('heading', { level: 1, name: 'Буров Павел Петрович' })).toBeInTheDocument();
    expect(screen.getByText(/Биография будет опубликована/)).toBeInTheDocument();
    const dates = screen.getByRole('region', { name: 'В календаре памятных дат' });
    expect(within(dates).getByText('4 марта, 2022')).toBeInTheDocument();
    expect(within(dates).getByRole('link', { name: 'Календарь памятных дат' })).toHaveAttribute('href', '/ru/calendar?year=2022');
    expect(screen.getByText(/переданного Государственным архивом/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('неизвестная личность — страница «не найдено»', async () => {
    renderAt('/ru/history/persons/nobody');
    expect(await screen.findByRole('heading', { level: 1, name: /не найдена|Страница не найдена/i })).toBeInTheDocument();
  });
});
