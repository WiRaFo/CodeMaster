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
  slug: 'main',
  sites: [],
};

export const CALENDAR = {
  years: [2026, 2025],
  year: 2026,
  items: [
    { id: 'c1', month: 1, day: 8, dateLabel: '8 января', text: '130 лет (1896-1971) со дня рождения Ефима Николаевича Пермитина, писателя', contentLang: 'ru', translationStatus: 'reviewed' },
    { id: 'c2', month: null, day: null, dateLabel: '1761 г.', text: '265 лет со дня основания п.Глубокое', contentLang: 'ru', translationStatus: 'reviewed' },
  ],
};

export const ABOUT = {
  history: { title: 'История архива', contentLang: 'ru', translationStatus: 'reviewed', dataOrigin: 'verified', blocks: [
    { type: 'p', text: 'Государственный архив Восточно-Казахстанской области образован в 1940 году.' },
    { type: 'ol', items: ['Государственного архива Восточно-Казахстанской области', 'Зайсанского филиала госархива области'] },
  ] },
  staff: [
    { id: 's1', fullName: 'Жапаров Аскар Кенжебаевич', position: 'Director', department: 'Management', phone: '8 (7232) 25-13-22', email: 'ak.zhaparov@akimvko.gov.kz', contentLang: 'en', translationStatus: 'machine' },
    { id: 's2', fullName: 'Бекниязқызы Жангуль', position: 'Head of department', department: 'Information Technology Department', phone: '8 (7232) 25-01-85', email: null, contentLang: 'en', translationStatus: 'machine' },
  ],
  social: [{ network: 'instagram', label: '@arhiv_vko', url: 'https://www.instagram.com/arhiv_vko/' }],
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
  facets: {
    types: [{ code: 'organization_record', name: 'Документы организаций и предприятий', count: 2 }, { code: 'photo', name: 'Фотодокументы', count: 1 }],
    periods: [{ slug: '1946-1991', name: '1946–1991', count: 3 }],
    branches: [{ slug: 'main', name: 'ГА ВКО', count: 3 }],
    settlements: [{ slug: 'ridder', name: 'Риддер', count: 1 }, { slug: 'ust-kamenogorsk', name: 'Усть-Каменогорск', count: 2 }],
    topics: [{ slug: 'industry', name: 'История промышленных предприятий', count: 2 }],
    access: [{ value: 'open', count: 2 }, { value: 'restricted', count: 1 }],
    hasDigitalCopy: { true: 1, false: 2 },
  },
};

const SYN = { dataOrigin: 'synthetic', contentLang: 'ru', translationStatus: 'reviewed' } as const;
const CARD_COMMON = {
  ...SYN,
  availableLanguages: ['kk', 'ru', 'en'],
  archiveCode: { fond: 'TEST-1', inventory: '1', case: '1', formatted: 'Ф. TEST-1. Оп. 1. Д. 1.' },
  date: { from: '1956-01-01', to: '1956-12-31', precision: 'year' },
  period: { slug: '1946-1991', name: '1946–1991 годы' },
  type: { code: 'organization_record', name: 'Документы организаций и предприятий' },
  originalLanguages: ['ru'],
  sheetCount: 24,
  author: null,
  organization: null,
  storage: { branch: { slug: 'main', name: 'ГА ВКО' }, location: null },
  hierarchy: {
    fond: { id: 'aa3dabb1-8b10-4815-8e7c-273b96318ab7', number: 'TEST-1', title: '[Синтетика] Маслозавод (тестовый фонд)' },
    inventory: { id: 'a6e225c4-f537-48e2-b191-270a5bd04cc1', number: '1', title: '[Синтетика] Опись дел постоянного хранения' },
    case: { id: '63d720d0-900d-4692-ad7a-c81cbe7fc1a4', number: '1', title: '[Синтетика] Протоколы заседаний правления' },
  },
  historicalNote: null,
  sourceNote: 'Синтетическая запись для разработки и тестов, не является архивным документом.',
  updatedAt: '2026-11-09T17:21:03.929Z',
};

/** Карточки документов по реальным ответам API (backend/tests/api-access.test.ts). */
export const DOCUMENTS = {
  open: {
    ...CARD_COMMON,
    id: '6b8741a3-8fc6-40af-9408-21b6f9709b6f',
    title: '[Синтетика] Протокол заседания правления маслозавода',
    description: 'Обсуждение плана выпуска сливочного масла и ремонта цеха.',
    documentNumber: '1',
    settlements: [{ slug: 'ust-kamenogorsk', name: 'Усть-Каменогорск' }],
    topics: [{ slug: 'industry', kind: 'history_topic', name: 'История промышленных предприятий' }],
    access: 'open',
    accessConditions: null,
    digitalCopy: { availableOnline: true, pageCount: 3 },
    transcription: 'Слушали: о ремонте сепаратора.',
  },
  restricted: {
    ...CARD_COMMON,
    id: 'bf573051-5308-494c-b872-4b9c06887d00',
    title: '[Синтетика] Личные дела работников маслозавода',
    description: null,
    documentNumber: '2',
    settlements: [],
    topics: [],
    access: 'restricted',
    accessConditions: 'Документ содержит персональные данные. Ознакомление в читальном зале по письменному запросу; цифровая копия не публикуется.',
    digitalCopy: { availableOnline: false },
  },
  pages: {
    items: [1, 2, 3].map((n) => ({
      pageNumber: n,
      sheetLabel: String(n),
      assetId: `00000000-0000-4000-8000-00000000000${n}`,
      kind: 'scan_page',
      mimeType: 'image/svg+xml',
      width: 1240,
      height: 1754,
      hasTextLayer: false,
      downloadAllowed: false,
      alt: `Синтетическая страница ${n} из 3`,
      altLang: 'ru',
      derivatives: [],
    })),
  },
};

/** Подменяет fetch: известные пути API отвечают фикстурами, остальные — 404 как у backend. */
export function apiMock(overrides: Record<string, unknown> = {}) {
  const table: Array<[string, unknown]> = [
    ...Object.entries(overrides),
    [`/api/v1/catalog/documents/${DOCUMENTS.open.id}/pages?`, DOCUMENTS.pages],
    [`/api/v1/catalog/documents/${DOCUMENTS.open.id}?`, DOCUMENTS.open],
    [`/api/v1/catalog/documents/${DOCUMENTS.restricted.id}?`, DOCUMENTS.restricted],
    ['/api/v1/branches/main', MAIN_BRANCH],
    ['/api/v1/about?', ABOUT],
    ['/api/v1/calendar?', CALENDAR],
    ['/api/v1/branches?', FIXTURES.branches],
    ['/api/v1/home?', FIXTURES.home],
    ['/api/v1/catalog/documents?', FIXTURES.catalog],
    ['/api/v1/catalog/facets?', FIXTURES.facets],
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
