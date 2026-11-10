/**
 * Состояние поиска в каталоге хранится только в адресе страницы (F-036): ссылку на выдачу можно
 * сохранить или отправить, «Назад» возвращает предыдущее состояние. Имена параметров совпадают с API
 * (documentFiltersSchema в packages/shared), поэтому адрес страницы и запрос к API строятся одной функцией.
 */

export const MULTI_FILTERS = ['branch', 'period', 'type', 'settlement', 'topic', 'organization', 'access'] as const;
export type MultiFilter = (typeof MULTI_FILTERS)[number];

export const SORTS = ['relevance', 'date_asc', 'date_desc', 'code'] as const;
export type Sort = (typeof SORTS)[number];
export const isSort = (v: string | null): v is Sort => SORTS.some((s) => s === v);

export interface CatalogQuery {
  q: string;
  /** Автор или составитель: поиск по части имени (F-034). */
  author: string;
  multi: Record<MultiFilter, string[]>;
  hasDigitalCopy: boolean;
  yearFrom: number | null;
  yearTo: number | null;
  sort: Sort;
  page: number;
}

const emptyMulti = (): Record<MultiFilter, string[]> => ({ branch: [], period: [], type: [], settlement: [], topic: [], organization: [], access: [] });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YEAR_MIN = 1000;
const YEAR_MAX = 2100;

function parseYear(value: string | null): number | null {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const n = Number(value);
  return n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

/** Разбор адреса. Неизвестные и неверные значения отбрасываются, чтобы API не отвечал 400 на испорченную ссылку. */
export function parseCatalogQuery(params: URLSearchParams): CatalogQuery {
  const multi = emptyMulti();
  for (const key of MULTI_FILTERS) {
    const values = params.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim()).filter((v) => v && v.length <= 100);
    multi[key] = [...new Set(values)].slice(0, 20);
  }
  multi.access = multi.access.filter((v) => v === 'open' || v === 'restricted');
  multi.organization = multi.organization.filter((v) => UUID.test(v));
  let yearFrom = parseYear(params.get('yearFrom'));
  let yearTo = parseYear(params.get('yearTo'));
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];
  const sortParam = params.get('sort');
  const q = (params.get('q') ?? '').trim().slice(0, 200);
  return {
    q,
    author: (params.get('author') ?? '').trim().slice(0, 200),
    multi,
    hasDigitalCopy: params.get('hasDigitalCopy') === 'true',
    yearFrom,
    yearTo,
    sort: isSort(sortParam) ? sortParam : q ? 'relevance' : 'code',
    page: Math.min(10_000, Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)),
  };
}

/** Параметры фильтров без страницы и сортировки — общие для выдачи, фасетов и адреса. */
export function filterParams(query: CatalogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.author) p.set('author', query.author);
  for (const key of MULTI_FILTERS) for (const v of query.multi[key]) p.append(key, v);
  if (query.hasDigitalCopy) p.set('hasDigitalCopy', 'true');
  if (query.yearFrom !== null) p.set('yearFrom', String(query.yearFrom));
  if (query.yearTo !== null) p.set('yearTo', String(query.yearTo));
  return p;
}

/** Адрес страницы: сортировка и страница пишутся, только если отличаются от умолчаний. */
export function toSearchString(query: CatalogQuery, extra: Record<string, string> = {}): string {
  const p = filterParams(query);
  const defaultSort: Sort = query.q ? 'relevance' : 'code';
  if (query.sort !== defaultSort) p.set('sort', query.sort);
  if (query.page > 1) p.set('page', String(query.page));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function activeFilterCount(query: CatalogQuery): number {
  return (
    MULTI_FILTERS.reduce((n, key) => n + query.multi[key].length, 0) +
    (query.author ? 1 : 0) +
    (query.hasDigitalCopy ? 1 : 0) +
    (query.yearFrom !== null ? 1 : 0) +
    (query.yearTo !== null ? 1 : 0)
  );
}

export function toggleValue(query: CatalogQuery, key: MultiFilter, value: string): CatalogQuery {
  const list = query.multi[key];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return { ...query, multi: { ...query.multi, [key]: next }, page: 1 };
}

export function clearFilters(query: CatalogQuery): CatalogQuery {
  return {
    ...query,
    author: '',
    multi: emptyMulti(),
    hasDigitalCopy: false,
    yearFrom: null,
    yearTo: null,
    page: 1,
  };
}
