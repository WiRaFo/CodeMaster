import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../src/modules/assistant/intents.ts';
import { normalize, parseQuery, type SettlementDictEntry } from '../src/modules/assistant/query-parser.ts';

/** ЭТАП 12. Разбор запроса правилами (ТЗ §5.8 Б, с. 10; F-123, F-124) и намерение вопроса (F-120, F-122). */
const DICT: SettlementDictEntry[] = [
  { slug: 'ust-kamenogorsk', names: ['ust-kamenogorsk', 'Усть-Каменогорск', 'Өскемен', 'Oskemen'] },
  { slug: 'ridder', names: ['ridder', 'Риддер', 'Ridder', 'Лениногорск'] },
  { slug: 'semey', names: ['semey', 'Семей', 'Semey', 'Семипалатинск'] },
  { slug: 'altai', names: ['altai', 'Алтай', 'Altai', 'Зыряновск'] },
];
const parse = (q: string) => {
  const p = parseQuery(q, DICT);
  return { type: p.type, settlement: p.settlement, topic: p.topic, years: p.yearFrom === undefined ? null : [p.yearFrom, p.yearTo], keywords: p.keywords };
};

describe('пример ТЗ на трёх языках (F-123)', () => {
  it.each([
    'фотографии Усть-Каменогорска 1960-х',
    'Найди фото Өскемена 1960-е годы',
    'Өскемен фотосуреттері 1960 жылдары',
    '1960-шы жылдардағы Өскемен фотосуреттері',
    'photos of Oskemen 1960s',
    'Ust-Kamenogorsk photographs from the 1960s',
  ])('%s → фото, Усть-Каменогорск, 1960–1969', (q) => {
    expect(parse(q)).toEqual({ type: ['photo'], settlement: ['ust-kamenogorsk'], topic: [], years: [1960, 1969], keywords: '' });
  });
});

describe('исторические и казахские названия, падежи (F-124)', () => {
  it.each([
    ['документы Лениногорска', 'ridder'],
    ['школы Семипалатинска', 'semey'],
    ['фотографии Семея', 'semey'],
    ['Семейде 1950 жылы', 'semey'],
    ['карты Зыряновска', 'altai'],
    ['Өскеменнің тарихы', 'ust-kamenogorsk'],
    ['в Риддере', 'ridder'],
  ])('%s → %s', (q, slug) => {
    expect(parse(q).settlement).toEqual([slug]);
  });

  it('слова с той же основой не принимаются за город', () => {
    expect(parse('семейные фотографии')).toMatchObject({ settlement: [], type: ['photo'], topic: ['family'] });
    expect(parse('Алтайский край').settlement).toEqual([]);
    expect(parse('карточка документа').type).toEqual([]);
  });
});

describe('годы', () => {
  it.each([
    ['в годы войны', [1941, 1945]],
    ['World War II', [1941, 1945]],
    ['с 1950 по 1960', [1950, 1960]],
    ['1941–1945 гг.', [1941, 1945]],
    ['XIX век', [1801, 1900]],
    ['19th century', [1801, 1900]],
    ['70-х годов', [1970, 1979]],
    ['1965 год', [1965, 1965]],
  ])('%s → %j', (q, years) => {
    expect(parse(q).years).toEqual(years);
  });
});

describe('тематика и ключевые слова', () => {
  it('заводы в годы войны: тематика «промышленность», годы войны без лишней тематики войны', () => {
    expect(parse('документы о заводах Лениногорска в годы Великой Отечественной войны')).toEqual({
      type: [], settlement: ['ridder'], topic: ['industry'], years: [1941, 1945], keywords: '',
    });
  });
  it('нераспознанные значимые слова остаются полнотекстовым запросом, служебные отбрасываются', () => {
    expect(parse('найди протокол заседания правления маслозавода').keywords).toBe('протокол заседания правления маслозавода');
    expect(normalize('  «Фото»  Ёлки! ')).toBe('фото елки');
  });
});

describe('намерение вопроса (F-120, F-122)', () => {
  const intent = (q: string) => classifyIntent(normalize(q), parseQuery(q, DICT)).kind;
  it.each([
    ['Как подать заявление на архивную справку?', 'service_request'],
    ['Хочу заказать копию документа', 'service_request'],
    ['Сколько стоит справка?', 'service_request'],
    ['Мұрағаттық анықтама алу үшін өтінішті қалай беруге болады?', 'service_request'],
    ['How do I apply for an archive certificate?', 'service_request'],
    ['Можно оплатить онлайн?', 'service_request'],
    ['Что такое опись?', 'term'],
    ['Шифр деген не?', 'term'],
    ['What is a fonds?', 'term'],
    ['Адрес филиала в Риддере', 'branch'],
    ['Режим работы читального зала', 'branch'],
    ['Мекенжай мен телефон', 'branch'],
    ['Where is the archive? Opening hours', 'branch'],
    ['Где посмотреть выставки?', 'navigation'],
    ['Версия для слабовидящих', 'navigation'],
    ['Фотографии Усть-Каменогорска 1960-х', 'search'],
    ['протокол маслозавода', 'search'],
    ['?', 'unknown'],
  ])('%s → %s', (q, kind) => {
    expect(intent(q)).toBe(kind);
  });
});

describe('термины с границами слов в кириллице', () => {
  const intent = (q: string) => classifyIntent(normalize(q), parseQuery(q, DICT));
  it('«дело», «лист» и «қор» распознаются как слова, а не как части других слов', () => {
    expect(intent('Что такое дело?')).toMatchObject({ kind: 'term', term: 'case' });
    expect(intent('Что значит лист в шифре?')).toMatchObject({ kind: 'term', term: 'archiveCode' });
    expect(intent('Қор деген не?')).toMatchObject({ kind: 'term', term: 'fond' });
    expect(intent('Что такое делопроизводство?').kind).not.toBe('term');
  });
});
