import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idOf, testApp } from './helpers.ts';

/**
 * ЭТАП 12. Архивный помощник на правилах (ТЗ §5.8 А, Б, с. 10–11; F-120–F-125).
 * Контрольный набор вопросов на трёх языках; ссылки ответа ведут только на существующие открытые записи.
 */
let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp();
});
afterAll(() => t.close());

type Answer = Record<string, unknown> & {
  intent: string;
  documents?: Array<{ id: string; title: string; access: string }>;
  recognized?: Array<{ kind: string; value?: string; label?: string }>;
  branches?: Array<{ slug: string }>;
  dropped?: string[];
  catalogQuery?: string;
};
let n = 0;
async function ask(q: string, lang = 'ru'): Promise<Answer> {
  // Разные адреса клиентов, чтобы контрольный набор не упёрся в ограничение частоты.
  const res = await t.app.inject({ method: 'GET', url: `/api/v1/assistant/ask?${new URLSearchParams({ q, lang }).toString()}`, remoteAddress: `10.12.0.${(n++ % 200) + 1}` });
  expect(res.statusCode, q).toBe(200);
  expect(res.headers['cache-control']).toBe('no-store');
  return res.json<Answer>();
}

const CONTROL: Array<[string, string, string]> = [
  ['ru', 'Фотографии Усть-Каменогорска 1960-х', 'search'],
  ['kk', 'Өскемен фотосуреттері 1960 жылдары', 'search'],
  ['en', 'Photos of Oskemen in the 1960s', 'search'],
  ['ru', 'протокол заседания правления маслозавода', 'search'],
  ['ru', 'документы маслозавода 1950-х годов', 'search'],
  ['ru', 'Как подать заявление на архивную справку?', 'service_request'],
  ['ru', 'Хочу заказать копию документа', 'service_request'],
  ['kk', 'Мұрағаттық анықтама алу үшін өтінішті қалай беруге болады?', 'service_request'],
  ['en', 'How do I order a copy and pay for it?', 'service_request'],
  ['ru', 'Что такое опись?', 'term'],
  ['ru', 'Что значит архивный шифр?', 'term'],
  ['kk', 'Қор деген не?', 'term'],
  ['en', 'What is a restricted document?', 'term'],
  ['ru', 'что такое архив', 'term'],
  ['kk', 'Мұрағат деген не?', 'term'],
  ['ru', 'Что такое путеводитель?', 'term'],
  ['en', 'What are personnel records?', 'term'],
  ['ru', 'Что такое квазар?', 'unknown'],
  ['ru', 'Адрес филиала в Риддере', 'branch'],
  ['ru', 'Режим работы читального зала', 'branch'],
  ['kk', 'Өскемендегі мұрағаттың мекенжайы', 'branch'],
  ['en', 'Phone number of the Zaisan branch', 'branch'],
  ['ru', 'Где посмотреть онлайн-выставки?', 'navigation'],
  ['en', 'Latest news', 'navigation'],
  ['kk', 'Көрмелер қайда?', 'navigation'],
];

describe('контрольный набор вопросов (F-120, F-121)', () => {
  it.each(CONTROL)('%s: %s → %s', async (lang, q, intent) => {
    expect((await ask(q, lang)).intent).toBe(intent);
  });
});

describe('пример ТЗ §5.8 Б (F-123)', () => {
  it('«фотографии Усть-Каменогорска 1960-х» → фильтры каталога и найденная фотография со ссылкой', async () => {
    const a = await ask('фотографии Усть-Каменогорска 1960-х');
    expect(a.recognized?.map((r) => [r.kind, r.value ?? null, r.label ?? null])).toEqual([
      ['years', null, null],
      ['settlement', 'ust-kamenogorsk', 'Усть-Каменогорск'],
      ['type', 'photo', 'Фотографии'],
    ]);
    expect(a.catalogQuery).toBe('type=photo&settlement=ust-kamenogorsk&yearFrom=1960&yearTo=1969');
    expect(a.documents?.map((d) => d.title)).toEqual(['Фотография коллектива маслозавода']);
    expect(a['suggestions']).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'prevDecade' }), expect.objectContaining({ reason: 'allTypes' })]));
  });

  it('на казахском подписи фильтров на казахском', async () => {
    const a = await ask('Өскемен фотосуреттері 1960 жылдары', 'kk');
    expect(a.recognized?.find((r) => r.kind === 'type')?.label).toBe('Фотосуреттер');
  });

  it('при пустой выдаче снимаются узкие условия, и ответ говорит, какие; единственное условие не снимается', async () => {
    const a = await ask('фотографии 1960-х годов кракозябра');
    expect(a.dropped).toEqual(['keywords']);
    expect(a['total']).toBeGreaterThan(0);
    const none = await ask('кракозябра');
    expect(none).toMatchObject({ intent: 'search', total: 0, dropped: [], documents: [] });
  });
});

describe('ссылки и доступ (F-125, S-021)', () => {
  it('каждый документ в ответе открывается публичной карточкой; закрытые и неопубликованные не попадают в ответ', async () => {
    const hidden = new Set(await Promise.all(['TEST-1/1/1/3', 'TEST-1/1/1/4', 'TEST-1/1/2/1', 'TEST-1/1/3/1', 'TEST-3/1/1/1', 'TEST-4/1/1/1'].map((k) => idOf(t.db, 'documents', k))));
    const questions = [
      'Открытый документ в закрытом деле', 'Документ в закрытом фонде', 'закрытое дело 1961', 'документы 1980 года', 'маслозавод', 'личные дела работников',
      ...CONTROL.filter(([, , i]) => i === 'search').map(([, q]) => q),
    ];
    let seen = 0;
    for (const q of questions) {
      const a = await ask(q);
      for (const d of a.documents ?? []) {
        seen++;
        expect(hidden.has(d.id), `${q}: ${d.title}`).toBe(false);
        expect((await t.get(`/api/v1/catalog/documents/${d.id}`)).status).toBe(200);
      }
    }
    expect(seen).toBeGreaterThan(5);
  });

  it('вопрос о заявлении не возвращает документов и ведёт только на справочные разделы', async () => {
    const a = await ask('Как подать заявление на архивную справку?');
    expect(a).toEqual({ intent: 'service_request', lang: 'ru', links: ['visitors', 'branches'] });
  });

  it('филиалы берутся из публичного реестра', async () => {
    expect((await ask('Адрес филиала в Риддере')).branches?.map((b) => b.slug)).toEqual(['ridder']);
    expect((await ask('Режим работы читального зала')).branches?.map((b) => b.slug)).toEqual(['main', 'main-krylova']);
  });
});

describe('ограничения ввода', () => {
  it('вопрос длиннее 300 символов и пустой вопрос — 400; больше 30 вопросов в минуту с одного адреса — 429', async () => {
    expect((await t.get(`/api/v1/assistant/ask?q=${'а'.repeat(301)}`)).status).toBe(400);
    expect((await t.get('/api/v1/assistant/ask?q=%20')).status).toBe(400);
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) {
      codes.push((await t.app.inject({ method: 'GET', url: '/api/v1/assistant/ask?q=%3F', remoteAddress: '10.13.0.1' })).statusCode);
    }
    expect(codes.slice(0, 30).every((c) => c === 200)).toBe(true);
    expect(codes[30]).toBe(429);
  });
});
