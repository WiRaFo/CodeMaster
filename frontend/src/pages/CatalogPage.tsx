import * as Dialog from '@radix-ui/react-dialog';
import { SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CatalogFilters } from '../components/catalog/CatalogFilters.tsx';
import { CatalogSearchForm } from '../components/catalog/CatalogSearchForm.tsx';
import { DocumentCard } from '../components/catalog/DocumentCard.tsx';
import { SemanticResults } from '../components/catalog/SemanticResults.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import {
  MULTI_FILTERS,
  SORTS,
  isSort,
  activeFilterCount,
  clearFilters,
  filterParams,
  parseCatalogQuery,
  toSearchString,
  toggleValue,
  type CatalogQuery,
} from '../lib/catalog-query.ts';
import type { CatalogFacets, DocumentSearchResult, FacetValue } from '../lib/types.ts';
import { dataOrPrevious, useApi } from '../lib/useApi.ts';

const PAGE_SIZE = 20;

/** На узком экране фильтры открываются в диалоге (docs/accessibility.md §7). Ширина совпадает с брейкпойнтом lg. */
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023.98px)').matches;

/**
 * Электронный каталог (ТЗ §5.3; F-030 – F-036): поиск, фильтры с фасетными счётчиками, сортировка, страницы.
 * Всё состояние — в адресе; запросы к API строятся из того же состояния.
 * Если подключена модель ИИ, под выдачей первой страницы — документы, похожие по смыслу (D-023).
 */
export function CatalogPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const query = useMemo(() => parseCatalogQuery(params), [params]);
  const [dialogOpen, setDialogOpen] = useState(() => params.get('filters') === 'open' && isNarrow());

  const apiFilters = filterParams(query);
  apiFilters.set('lang', lang);
  const searchParams = new URLSearchParams(apiFilters);
  searchParams.set('sort', query.sort);
  searchParams.set('page', String(query.page));
  searchParams.set('pageSize', String(PAGE_SIZE));
  const result = useApi<DocumentSearchResult>(`/catalog/documents?${searchParams.toString()}`);
  const facetsState = useApi<CatalogFacets>(`/catalog/facets?${apiFilters.toString()}`);
  const facets = dataOrPrevious(facetsState);

  const go = (next: CatalogQuery) => navigate(`/${lang}/catalog${toSearchString(next)}`);
  const pageHref = (page: number) => `/${lang}/catalog${toSearchString({ ...query, page })}`;
  const activeCount = activeFilterCount(query);
  const shown = dataOrPrevious(result);
  const total = result.status === 'ready' ? result.data.total : null;

  const filters = (idPrefix: string) => <CatalogFilters query={query} facets={facets} onChange={go} idPrefix={idPrefix} />;

  return (
    <>
      <PageHeading title={t('nav.catalog')} />
      <div className="mb-6 max-w-3xl">
        <CatalogSearchForm id="catalog-search" initialQuery={query.q} key={query.q} keepParams={filterParams({ ...query, q: '' }).toString()} />
        <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <Link to={`/${lang}/catalog/fonds`}>{t('fonds.guide')}</Link>
          <Link to={`/${lang}/catalog/fonds?kind=personal`}>{t('fonds.kind.personal')}</Link>
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside aria-labelledby="catalog-filters-title" className="hidden lg:block">
          <h2 id="catalog-filters-title" className="mb-4 text-xl font-bold">{t('catalog.filtersTitle')}</h2>
          {filters('filters')}
        </aside>

        <section aria-labelledby="catalog-results" className="min-w-0">
          <h2 id="catalog-results" className="visually-hidden">{t('catalog.results')}</h2>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
              <Dialog.Trigger className="btn-secondary lg:hidden">
                <SlidersHorizontal aria-hidden="true" className="size-5" />
                <span>{activeCount ? t('catalog.filtersButtonCount', { count: activeCount }) : t('catalog.filtersTitle')}</span>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
                <Dialog.Content className="fixed inset-0 z-40 flex flex-col bg-surface text-text sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md">
                  <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                    <Dialog.Title className="text-xl font-bold">{t('catalog.filtersTitle')}</Dialog.Title>
                    <Dialog.Close className="btn-icon" aria-label={t('header.close')}>
                      <X aria-hidden="true" className="size-6" />
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="visually-hidden">{t('catalog.filtersHint')}</Dialog.Description>
                  <div className="flex-1 overflow-y-auto p-4">{filters('filters-dialog')}</div>
                  <div className="flex flex-wrap gap-3 border-t border-border p-4">
                    <Dialog.Close className="btn-primary flex-1">
                      {total === null ? t('catalog.showResults') : t('catalog.showCount', { count: total })}
                    </Dialog.Close>
                    {activeCount ? (
                      <button type="button" className="btn-secondary" onClick={() => go(clearFilters(query))}>{t('catalog.clearAll')}</button>
                    ) : null}
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>

            <div className="flex flex-col">
              <label htmlFor="catalog-sort" className="text-sm font-semibold">{t('catalog.sortLabel')}</label>
              <select id="catalog-sort" className="input" value={query.sort} onChange={(e) => {
                const sort = e.target.value;
                if (isSort(sort)) go({ ...query, sort, page: 1 });
              }}>
                {SORTS.filter((s) => s !== 'relevance' || query.q).map((s) => (
                  <option key={s} value={s}>{t(`catalog.sort.${s}`)}</option>
                ))}
              </select>
            </div>
          </div>

          <ActiveFilters query={query} facets={facets} onChange={go} />

          {shown === null ? (
            <LoadStatus status={result.status === 'error' ? 'error' : 'loading'} />
          ) : (
            <div aria-busy={result.status === 'loading'} className={result.status === 'loading' ? 'opacity-60' : undefined}>
              <p role="status" className="mb-2 font-semibold">
                {query.q ? t('catalog.foundFor', { count: shown.total, q: query.q }) : t('catalog.found', { count: shown.total })}
              </p>
              {shown.interpretedCode ? (
                <p className="mb-4">{t('catalog.interpretedCode', { code: shown.interpretedCode.formatted })}</p>
              ) : null}
              {shown.items.length === 0 ? (
                <div className="mb-4">
                  <p className="mb-2">{t('catalog.nothingFound')}</p>
                  {activeCount ? (
                    <button type="button" className="btn-secondary" onClick={() => go(clearFilters(query))}>{t('catalog.clearAll')}</button>
                  ) : null}
                </div>
              ) : (
                <ol className="mb-6 grid gap-3" start={(query.page - 1) * PAGE_SIZE + 1}>
                  {shown.items.map((d) => (
                    <li key={d.id}>
                      <DocumentCard lang={lang} doc={d} />
                    </li>
                  ))}
                </ol>
              )}
              {query.q && query.page === 1 ? (
                <SemanticResults lang={lang} q={query.q} exclude={new Set(shown.items.map((d) => d.id))} />
              ) : null}
              {shown.totalPages > 1 ? (
                <nav aria-label={t('catalog.pagination')} className="flex flex-wrap items-center gap-3">
                  {query.page > 1 ? <Link to={pageHref(query.page - 1)} className="btn-secondary">{t('catalog.prev')}</Link> : null}
                  <span>{t('catalog.pageOf', { page: query.page, total: shown.totalPages })}</span>
                  {query.page < shown.totalPages ? <Link to={pageHref(query.page + 1)} className="btn-secondary">{t('catalog.next')}</Link> : null}
                </nav>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** Выбранные фильтры: каждый снимается отдельной кнопкой, есть «Сбросить всё» (F-034). */
function ActiveFilters({ query, facets, onChange }: { query: CatalogQuery; facets: CatalogFacets | null; onChange: (q: CatalogQuery) => void }) {
  const { t } = useTranslation();
  const lists: Record<string, FacetValue[]> = facets
    ? { branch: facets.branches, type: facets.types, period: facets.periods, settlement: facets.settlements, topic: facets.topics }
    : {};
  const nameOf = (key: string, value: string) => {
    if (key === 'access') return t(`catalog.accessValue.${value}`);
    const item = lists[key]?.find((x) => (x.slug ?? x.code) === value);
    return item?.name ?? value;
  };

  const chips: Array<{ id: string; label: string; next: CatalogQuery }> = [];
  for (const key of MULTI_FILTERS) {
    for (const value of query.multi[key]) {
      chips.push({ id: `${key}:${value}`, label: `${t(`catalog.filter.${key}`)}: ${nameOf(key, value)}`, next: toggleValue(query, key, value) });
    }
  }
  if (query.hasDigitalCopy) chips.push({ id: 'copy', label: t('catalog.filter.hasDigitalCopy'), next: { ...query, hasDigitalCopy: false, page: 1 } });
  if (query.yearFrom !== null || query.yearTo !== null) {
    chips.push({
      id: 'years',
      label: `${t('catalog.filter.years')}: ${query.yearFrom ?? '…'}–${query.yearTo ?? '…'}`,
      next: { ...query, yearFrom: null, yearTo: null, page: 1 },
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="visually-hidden">{t('catalog.activeFilters')}</h3>
      <ul className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <li key={c.id}>
            <button type="button" className="filter-chip" onClick={() => onChange(c.next)} aria-label={t('catalog.removeFilter', { label: c.label })}>
              <span>{c.label}</span>
              <X aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="btn-secondary" onClick={() => onChange(clearFilters(query))}>{t('catalog.clearAll')}</button>
        </li>
      </ul>
    </div>
  );
}
