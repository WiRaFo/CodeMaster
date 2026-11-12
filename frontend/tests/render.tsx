import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { A11yProvider } from '../src/app/A11yProvider.tsx';
import { AnnouncerProvider } from '../src/app/Announcer.tsx';
import { routes } from '../src/app/routes.tsx';

export const MAIN_BRANCH = {
  name: 'Государственный архив Восточно-Казахстанской области',
  address: 'г. Усть-Каменогорск, ул. Головкова, 26/1',
  phone: '8 (7232) 25-59-76',
  email: 'arhiv-ukg@yandex.kz',
  scheduleText: 'Пн–пт, 9:00–18:00',
  readingRoomSchedule: 'Читальный зал: пн–пт, 10:00–17:00',
  needsVerification: true,
};

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <A11yProvider>
      <AnnouncerProvider>
        <RouterProvider router={router} />
      </AnnouncerProvider>
    </A11yProvider>,
  );
  return { ...utils, router };
}

const DEMO = { dataOrigin: 'demo', contentLang: 'ru', translationStatus: 'reviewed' } as const;

/** Ответы API для тестов интерфейса; форма совпадает с реальными ответами backend (tests/api-content.test.ts). */
export const FIXTURES = {
  home: {
    news: [
      { ...DEMO, slug: 'demo-new-site-prototype', title: '[Демо] Прототип нового сайта архива', lead: 'Демонстрационная новость.', publishedAt: '2026-11-08T10:00:00.000Z', rubric: { slug: 'news', name: 'Новости' } },
    ],
    exhibitions: [{ ...DEMO, slug: 'demo-exhibition-example', title: '[Демо] Пример виртуальной выставки', lead: 'Показывает, как устроена страница выставки.', yearFrom: null, yearTo: null }],
    history: {
      topics: [
        { slug: 'region', name: 'История Восточно-Казахстанской области', publicationCount: 1 },
        { slug: 'family', name: 'История семьи и поколений', publicationCount: 1 },
      ],
      publications: [
        { ...DEMO, slug: 'demo-how-to-read-archive-code', kind: 'article', title: '[Демо] Как читать архивный шифр', lead: 'Шифр указывает фонд, опись, дело и листы.', periodText: null, yearFrom: null, yearTo: null, publishedAt: '2026-11-09T10:00:00.000Z', topics: [{ slug: 'region', name: 'История Восточно-Казахстанской области' }] },
      ],
      documents: [
        { id: '6b8741a3-8fc6-40af-9408-21b6f9709b6f', title: '[Синтетика] Протокол заседания правления маслозавода', archiveCode: { fond: 'TEST-1', inventory: '1', case: '1', formatted: 'Ф. TEST-1. Оп. 1. Д. 1.' }, date: { from: '1956-01-01', to: '1956-12-31', precision: 'year' }, hasDigitalCopy: true, dataOrigin: 'synthetic', contentLang: 'ru', translationStatus: 'reviewed' },
      ],
    },
  },
  branches: {
    items: [{ slug: 'main', isMain: true, name: MAIN_BRANCH.name, shortName: 'ГА ВКО', address: MAIN_BRANCH.address, phone: MAIN_BRANCH.phone, needsVerification: true }],
  },
  catalog: {
    items: [
      { id: '6b8741a3-8fc6-40af-9408-21b6f9709b6f', title: '[Синтетика] Протокол заседания правления маслозавода', contentLang: 'ru', translationStatus: 'reviewed', archiveCode: { fond: 'TEST-1', inventory: '1', case: '1', formatted: 'Ф. TEST-1. Оп. 1. Д. 1.' }, documentNumber: '1', date: { from: '1956-01-01', to: '1956-12-31', precision: 'year' }, type: { code: 'organization_record', name: 'Документы организаций и предприятий' }, branch: { slug: 'main', name: 'ГА ВКО' }, access: 'open', hasDigitalCopy: true, dataOrigin: 'synthetic', highlight: 'Протокол &lt;script&gt; <mark>заседания</mark>' },
      { id: '1d2e7c6a-5b0e-4b7f-9a55-0c7d1f0b2a11', title: '[Синтетика] Ведомость', contentLang: 'ru', translationStatus: 'reviewed', archiveCode: { fond: 'TEST-1', inventory: '1', case: '1', formatted: 'Ф. TEST-1. Оп. 1. Д. 1.' }, documentNumber: '2', date: { from: '1957-01-01', to: '1957-12-31', precision: 'year' }, type: { code: 'organization_record', name: 'Документы организаций и предприятий' }, branch: { slug: 'main', name: 'ГА ВКО' }, access: 'restricted', hasDigitalCopy: false, dataOrigin: 'synthetic', highlight: null },
    ],
    page: 1, pageSize: 20, total: 2, totalPages: 1, interpretedCode: null,
  },
  news: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

/** Подменяет fetch: известные пути API отвечают фикстурами, остальные — 404 как у backend. */
export function apiMock(overrides: Record<string, unknown> = {}) {
  const table: Array<[string, unknown]> = [
    ...Object.entries(overrides),
    ['/api/v1/branches/main', MAIN_BRANCH],
    ['/api/v1/branches?', FIXTURES.branches],
    ['/api/v1/home?', FIXTURES.home],
    ['/api/v1/catalog/documents?', FIXTURES.catalog],
    ['/api/v1/news?', FIXTURES.news],
  ];
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const hit = table.find(([prefix]) => url.startsWith(prefix));
    return hit
      ? new Response(JSON.stringify(hit[1]), { status: 200 })
      : new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Resource not found' } }), { status: 404 });
  };
}
