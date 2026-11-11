import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { googleRouteUrl, straightDistanceKm, twoGisUrl } from '../src/lib/geo.ts';
import type { BranchDetail, BranchSummary } from '../src/lib/types.ts';
import { apiMock, renderAt } from './render.tsx';

/** ЭТАП 9. Филиалы и контакты (ТЗ §5.5; F-060–F-067). */
const base = (over: Partial<BranchSummary>): BranchSummary => ({
  id: '00000000-0000-4000-8000-000000000001', slug: 'main', parentId: null, isMain: true,
  type: { code: 'main_archive', name: 'Государственный архив' }, name: 'Государственный архив ВКО', shortName: 'ГА ВКО',
  address: 'г. Усть-Каменогорск, ул. Головкова, 26/1', settlement: { slug: 'ust-kamenogorsk', name: 'Усть-Каменогорск' },
  phone: '8 (7232) 25-59-76', email: 'arhiv@example.kz', coordinates: null, needsVerification: true,
  dataOrigin: 'migrated', contentLang: 'ru', translationStatus: 'reviewed', ...over,
});
const MAIN = base({});
const RIDDER = base({ id: '00000000-0000-4000-8000-000000000002', slug: 'ridder', isMain: false, type: { code: 'branch', name: 'Филиал' }, name: 'Риддерский филиал', shortName: 'Риддер', address: 'г. Риддер', phone: null, email: null });
const DETAIL: BranchDetail = {
  ...MAIN, postalCode: null, website: null, scheduleText: 'Пн–пт, 9:00–18:00', readingRoomSchedule: null,
  description: 'Сведения перенесены с текущего сайта.', mainDirections: null, competence: 'Документы по личному составу', serviceArea: null,
  accessibilityInfo: null, sourceUrl: 'http://e-arhiv.vko.gov.kz/ru/Page/Index/1330', verifiedAt: null,
  sites: [base({ slug: 'main-krylova', isMain: false, shortName: 'ул. Крылова, 39', address: 'г. Усть-Каменогорск, ул. Крылова, 39' })],
  highlightedFonds: [], staff: [],
};

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
    apiMock({ '/api/v1/branches/main?': DETAIL, '/api/v1/branches?lang=ru&q=': { items: [RIDDER] }, '/api/v1/branches?': { items: [MAIN, RIDDER] } }),
  );
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

async function axeViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('расчёты и ссылки маршрута (F-064, F-065)', () => {
  it('расстояние по прямой: Усть-Каменогорск — Риддер около 77 км (проверено вручную: 44 км по широте, 63 км по долготе)', () => {
    // Центры городов по справочным данным; проверяется формула, а не координаты подразделений.
    expect(straightDistanceKm({ lat: 49.948, lng: 82.628 }, { lat: 50.344, lng: 83.513 })).toBeCloseTo(76.9, 1);
    expect(straightDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111.2, 1);
  });

  it('Google Карты: адрес или координаты, режим и отправная точка; 2ГИС: поиск по адресу или маршрут по координатам', () => {
    const g = new URL(googleRouteUrl('г. Риддер', 'walking', 'ул. Ленина, 1'));
    expect(g.origin + g.pathname).toBe('https://www.google.com/maps/dir/');
    expect(Object.fromEntries(g.searchParams)).toEqual({ api: '1', destination: 'г. Риддер', travelmode: 'walking', origin: 'ул. Ленина, 1' });
    expect(new URL(googleRouteUrl({ lat: 50.1, lng: 83.2 }, 'transit')).searchParams.get('destination')).toBe('50.1,83.2');
    expect(twoGisUrl('г. Риддер', 'driving')).toBe('https://2gis.kz/search/%D0%B3.%20%D0%A0%D0%B8%D0%B4%D0%B4%D0%B5%D1%80');
    expect(decodeURIComponent(twoGisUrl({ lat: 50.1, lng: 83.2 }, 'walking', { lat: 49.9, lng: 82.6 }))).toBe('https://2gis.kz/directions/tab/pedestrian/points/82.6,49.9|83.2,50.1');
  });
});

describe('список подразделений (F-061, F-066)', () => {
  it('без сверенных координат карта не показывается, все адреса и телефоны — в списке; поиск меняет адрес и выдачу', async () => {
    const { container } = renderAt('/ru/branches');
    const card = (await screen.findByRole('link', { name: 'Государственный архив ВКО' })).closest('article') as HTMLElement;
    expect(within(card).queryByText('Сведения уточняются')).toBeNull();
    expect(within(card).getByRole('link', { name: '8 (7232) 25-59-76' })).toHaveAttribute('href', 'tel:87232255976');
    expect(screen.getByTestId('map-pending')).toHaveTextContent('Карта появится, когда архив сверит координаты');
    expect(screen.queryByTestId('branch-map')).toBeNull();
    expect(screen.getByText('Найдено подразделений: 2')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Название или населённый пункт' }), 'Риддер');
    await userEvent.click(screen.getByRole('button', { name: 'Показать' }));
    await waitFor(() => expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain('/api/v1/branches?lang=ru&q=%D0%A0%D0%B8%D0%B4%D0%B4%D0%B5%D1%80'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Государственный архив ВКО' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Риддерский филиал' })).toHaveAttribute('href', '/ru/branches/ridder');
    expect(screen.getByRole('link', { name: 'Сбросить' })).toHaveAttribute('href', '/ru/branches');
  });
});

describe('карта (F-060)', () => {
  it('маркеры — только у подразделений со сверенными координатами; у маркера есть название, в подсказке — ссылка на карточку', async () => {
    fetchMock.mockImplementation(apiMock({ '/api/v1/branches?': { items: [{ ...MAIN, coordinates: { lat: 49.95, lng: 82.61 } }, RIDDER] } }));
    renderAt('/ru/branches');
    const map = await screen.findByRole('region', { name: 'Карта подразделений' });
    await waitFor(() => expect(map.querySelectorAll('.leaflet-marker-icon')).toHaveLength(1));
    const marker = map.querySelector('.leaflet-marker-icon') as HTMLElement;
    expect(marker).toHaveAttribute('title', 'ГА ВКО');
    await userEvent.click(marker);
    expect(within(map).getByRole('link', { name: 'Подробнее' })).toHaveAttribute('href', '/ru/branches/main');
    expect(screen.queryByTestId('map-pending')).toBeNull();
    // Подразделение без координат по-прежнему в списке.
    expect(screen.getByRole('link', { name: 'Риддерский филиал' })).toBeInTheDocument();
  });
});

describe('карточка подразделения (F-062, F-063, F-067)', () => {
  it('контакты, компетенция, площадки, источник; маршрут по адресу без запроса геолокации', async () => {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    const { container } = renderAt('/ru/branches/main');
    expect(await screen.findByRole('heading', { level: 1, name: 'Государственный архив ВКО' })).toBeInTheDocument();
    expect(screen.getByText('Документы по личному составу')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ул. Крылова, 39' })).toHaveAttribute('href', '/ru/branches/main-krylova');
    expect(screen.getByRole('link', { name: 'Документы подразделения в электронном каталоге' })).toHaveAttribute('href', '/ru/catalog?branch=main');
    expect(screen.getByRole('link', { name: 'http://e-arhiv.vko.gov.kz/ru/Page/Index/1330' })).toBeInTheDocument();
    expect(screen.getByText('Расстояние появится после сверки координат подразделения.')).toBeInTheDocument();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);

    await userEvent.click(screen.getByRole('radio', { name: 'Пешком' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Откуда' }), 'ул. Ленина, 1');
    const google = new URL(screen.getByRole('link', { name: /Маршрут в Google Картах/ }).getAttribute('href') ?? '');
    expect(google.searchParams.get('destination')).toBe('г. Усть-Каменогорск, ул. Головкова, 26/1');
    expect(google.searchParams.get('origin')).toBe('ул. Ленина, 1');
    expect(google.searchParams.get('travelmode')).toBe('walking');
    expect(screen.getByRole('link', { name: /Открыть в 2ГИС/ })).toHaveAttribute('target', '_blank');
  });

  it('отказ в геолокации не ломает страницу; при сверенных координатах показано расстояние «по прямой»', async () => {
    let answer: 'deny' | 'allow' = 'deny';
    const getCurrentPosition = vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null) => {
      if (answer === 'deny') fail?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
      else ok({ coords: { latitude: 49.948, longitude: 82.628 } } as GeolocationPosition);
    });
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
    fetchMock.mockImplementation(apiMock({ '/api/v1/branches/main?': { ...DETAIL, coordinates: { lat: 50.344, lng: 83.513 } } }));
    renderAt('/ru/branches/main');
    await userEvent.click(await screen.findByRole('button', { name: 'Определить моё местоположение' }));
    expect(screen.getByText('Не удалось определить местоположение. Введите адрес отправления.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Откуда' })).not.toHaveAttribute('readonly');

    answer = 'allow';
    await userEvent.click(screen.getByRole('button', { name: 'Определить моё местоположение' }));
    expect(screen.getByTestId('straight-distance')).toHaveTextContent('Расстояние по прямой: 77 км');
    const google = new URL(screen.getByRole('link', { name: /Маршрут в Google Картах/ }).getAttribute('href') ?? '');
    expect(google.searchParams.get('origin')).toBe('49.948,82.628');
    expect(google.searchParams.get('destination')).toBe('50.344,83.513');
  });

  it('неопубликованное или несуществующее подразделение — 404', async () => {
    renderAt('/ru/branches/nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'Страница не найдена' })).toBeInTheDocument();
  });
});
