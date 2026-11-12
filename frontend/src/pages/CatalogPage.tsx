import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { CatalogSearchForm } from '../components/catalog/CatalogSearchForm.tsx';
import { Highlight } from '../components/catalog/Highlight.tsx';
import { LinkCard } from '../components/home/cards.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatYears } from '../lib/format.ts';
import type { DocumentSearchResult } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

const PAGE_SIZE = 20;

/**
 * Выдача электронного каталога (F-011, F-030). Базовый вариант ЭТАПА 4: запрос и страница в URL,
 * распознавание шифра, подсветка. Фильтры, фасеты и сортировка — ЭТАП 5.
 */
export function CatalogPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  const query = new URLSearchParams({ lang, page: String(page), pageSize: String(PAGE_SIZE) });
  if (q) query.set('q', q);
  const result = useApi<DocumentSearchResult>(`/catalog/documents?${query.toString()}`);

  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    if (q) next.set('q', q);
    if (p > 1) next.set('page', String(p));
    const s = next.toString();
    return `/${lang}/catalog${s ? `?${s}` : ''}`;
  };

  return (
    <>
      <PageHeading title={t('nav.catalog')} />
      <div className="mb-6 max-w-3xl">
        <CatalogSearchForm id="catalog-search" initialQuery={q} key={q} />
      </div>
      <p className="mb-6 text-sm text-muted">{t('catalog.filtersLater')}</p>

      <section aria-labelledby="catalog-results">
        <h2 id="catalog-results" className="visually-hidden">{t('catalog.results')}</h2>
        {result.status !== 'ready' ? (
          <LoadStatus status={result.status} />
        ) : (
          <>
            <p role="status" className="mb-2 font-semibold">
              {q ? t('catalog.foundFor', { count: result.data.total, q }) : t('catalog.found', { count: result.data.total })}
            </p>
            {result.data.interpretedCode ? (
              <p className="mb-4">{t('catalog.interpretedCode', { code: result.data.interpretedCode.formatted })}</p>
            ) : null}
            {result.data.items.length === 0 ? (
              <p className="mb-4">{t('catalog.nothingFound')}</p>
            ) : (
              <ol className="mb-6 grid gap-3">
                {result.data.items.map((d) => (
                  <li key={d.id}>
                    <LinkCard
                      to={`/${lang}/catalog/documents/${d.id}`}
                      title={d.title ?? d.archiveCode.formatted}
                      meta={
                        <>
                          <span>{d.archiveCode.formatted}</span>
                          {d.access === 'restricted' ? <span className="badge-warning">{t('catalog.restricted')}</span> : null}
                          <OriginBadge origin={d.dataOrigin} />
                        </>
                      }
                    >
                      <p className="text-sm text-muted">
                        {[formatYears(d.date), d.type.name, d.hasDigitalCopy ? t('home.digitalCopy') : null].filter(Boolean).join(' · ')}
                      </p>
                      {d.highlight ? (
                        <p className="text-sm">
                          <Highlight html={d.highlight} />
                        </p>
                      ) : null}
                      <TranslationNote contentLang={d.contentLang} translationStatus={d.translationStatus} />
                    </LinkCard>
                  </li>
                ))}
              </ol>
            )}
            {result.data.totalPages > 1 ? (
              <nav aria-label={t('catalog.pagination')} className="flex flex-wrap items-center gap-3">
                {page > 1 ? <Link to={pageHref(page - 1)} className="btn-secondary">{t('catalog.prev')}</Link> : null}
                <span>{t('catalog.pageOf', { page, total: result.data.totalPages })}</span>
                {page < result.data.totalPages ? <Link to={pageHref(page + 1)} className="btn-secondary">{t('catalog.next')}</Link> : null}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
