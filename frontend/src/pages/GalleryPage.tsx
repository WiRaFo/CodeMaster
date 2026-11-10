import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatYears } from '../lib/format.ts';
import type { GalleryItem, Paged } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/**
 * Галерея (ТЗ §5.6, F-085): открытые документы с цифровой копией, первая страница крупно.
 * Плитка ведёт на карточку документа, где копию можно листать и увеличивать.
 */
export function GalleryPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useApi<Paged<GalleryItem>>(`/history/gallery?lang=${lang}&page=${page}`);
  const href = (p: number) => `/${lang}/history/gallery${p > 1 ? `?page=${p}` : ''}`;
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: t('gallery.title') }]} />
      <PageHeading title={t('gallery.title')}>
        <p className="mt-2 max-w-3xl">{t('gallery.lead')}</p>
      </PageHeading>
      {state.status !== 'ready' ? <LoadStatus status={state.status} /> : state.data.items.length === 0 ? <p>{t('gallery.empty')}</p> : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4">
            {state.data.items.map((d) => (
              <li key={d.id}>
                <figure className="flex h-full flex-col overflow-hidden rounded-md border-2 border-border bg-surface">
                  <Link to={`/${lang}/catalog/documents/${d.id}`} className="block border-b-2 border-border">
                    <img
                      src={d.image.url}
                      alt={t('gallery.alt', { title: d.title ?? d.archiveCode.formatted })}
                      loading="lazy"
                      width={d.image.width ?? undefined}
                      height={d.image.height ?? undefined}
                      className="aspect-[3/4] h-auto w-full object-contain"
                    />
                  </Link>
                  <figcaption className="flex flex-col gap-1 p-3">
                    <span className="font-semibold">{d.title ?? d.archiveCode.formatted}</span>
                    <span className="text-sm text-muted">{[d.archiveCode.formatted, formatYears(d.date)].filter(Boolean).join(', ')}</span>
                    <OriginBadge origin={d.dataOrigin} />
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
          {state.data.totalPages > 1 ? (
            <nav aria-label={t('catalog.pagination')} className="mt-6 flex flex-wrap items-center gap-3">
              {page > 1 ? <Link to={href(page - 1)} className="btn-secondary">{t('catalog.prev')}</Link> : null}
              <span>{t('catalog.pageOf', { page, total: state.data.totalPages })}</span>
              {page < state.data.totalPages ? <Link to={href(page + 1)} className="btn-secondary">{t('catalog.next')}</Link> : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
