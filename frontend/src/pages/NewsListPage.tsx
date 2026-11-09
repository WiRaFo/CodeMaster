import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { LinkCard } from '../components/home/cards.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate } from '../lib/format.ts';
import type { NewsSummary, Paged } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/** Лента новостей (ТЗ §5.11). Фильтры по рубрике и филиалу — на этапе раздела новостей. */
export function NewsListPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const news = useApi<Paged<NewsSummary>>(`/news?lang=${lang}&page=${page}`);

  return (
    <>
      <PageHeading title={t('nav.news')} />
      {news.status !== 'ready' ? (
        <LoadStatus status={news.status} />
      ) : news.data.items.length === 0 ? (
        <p>{t('news.empty')}</p>
      ) : (
        <>
          <ul className="mb-6 grid gap-3 md:grid-cols-2">
            {news.data.items.map((n) => (
              <li key={n.slug}>
                <LinkCard
                  to={`/${lang}/news/${n.slug}`}
                  title={n.title ?? n.slug}
                  headingLevel={2}
                  meta={
                    <>
                      <time dateTime={n.publishedAt}>{formatDate(n.publishedAt, lang)}</time>
                      <OriginBadge origin={n.dataOrigin} />
                    </>
                  }
                >
                  {n.lead ? <p>{n.lead}</p> : null}
                  <TranslationNote contentLang={n.contentLang} translationStatus={n.translationStatus} />
                </LinkCard>
              </li>
            ))}
          </ul>
          {news.data.totalPages > 1 ? (
            <nav aria-label={t('catalog.pagination')} className="flex flex-wrap items-center gap-3">
              {page > 1 ? <Link to={`/${lang}/news?page=${page - 1}`} className="btn-secondary">{t('catalog.prev')}</Link> : null}
              <span>{t('catalog.pageOf', { page, total: news.data.totalPages })}</span>
              {page < news.data.totalPages ? <Link to={`/${lang}/news?page=${page + 1}`} className="btn-secondary">{t('catalog.next')}</Link> : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
