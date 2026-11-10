import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LinkCard } from '../components/home/cards.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate } from '../lib/format.ts';
import type { NewsList } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/**
 * Лента новостей (ТЗ §5.11, F-101): новые сверху, фильтр по рубрике с числом новостей и поиск
 * по всем языковым версиям. Рубрика, запрос и страница хранятся в адресе, ссылкой можно поделиться.
 */
export function NewsListPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rubric = params.get('rubric') ?? '';
  const q = (params.get('q') ?? '').trim().slice(0, 200);
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const [draft, setDraft] = useState(q);
  const filters = { ...(rubric ? { rubric } : {}), ...(q ? { q } : {}) };
  const news = useApi<NewsList>(`/news?${new URLSearchParams({ lang, page: String(page), ...filters }).toString()}`);
  const listHref = (next: Record<string, string>) => {
    const query = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== '')).toString();
    return `/${lang}/news${query ? `?${query}` : ''}`;
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    void navigate(listHref({ rubric, q: draft.trim() }));
  };

  return (
    <>
      <PageHeading title={t('nav.news')} />

      <form role="search" aria-label={t('news.searchLabel')} onSubmit={search} className="mb-6 flex max-w-2xl flex-wrap items-end gap-2">
        <div className="flex min-w-0 grow flex-col gap-1">
          <label htmlFor="news-q" className="font-semibold">{t('news.searchLabel')}</label>
          <input id="news-q" type="search" className="input" maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">{t('news.searchButton')}</button>
        {q || rubric ? <Link to={listHref({})} className="btn-secondary">{t('news.reset')}</Link> : null}
      </form>

      {news.status === 'ready' ? (
        <nav aria-label={t('news.rubrics')} className="mb-6">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Link to={listHref({ q })} aria-current={rubric === '' ? 'true' : undefined} className="topic-link aria-[current=true]:font-semibold">
                {t('news.allRubrics')}
              </Link>
            </li>
            {news.data.rubrics.map((r) => (
              <li key={r.slug}>
                <Link to={listHref({ rubric: r.slug, q })} aria-current={rubric === r.slug ? 'true' : undefined} className="topic-link aria-[current=true]:font-semibold">
                  {r.name ?? r.slug} ({r.count})
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {news.status !== 'ready' ? (
        <LoadStatus status={news.status} />
      ) : (
        <>
          <p role="status" className="mb-4">
            {q || rubric ? t('news.found', { count: news.data.total }) : null}
          </p>
          {news.data.items.length === 0 ? (
            <p>{q || rubric ? t('news.nothingFound') : t('news.empty')}</p>
          ) : (
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
                        {n.rubric?.name ? <span>{n.rubric.name}</span> : null}
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
          )}
          {news.data.totalPages > 1 ? (
            <nav aria-label={t('catalog.pagination')} className="flex flex-wrap items-center gap-3">
              {page > 1 ? <Link to={listHref({ ...filters, page: String(page - 1) })} className="btn-secondary">{t('catalog.prev')}</Link> : null}
              <span>{t('catalog.pageOf', { page, total: news.data.totalPages })}</span>
              {page < news.data.totalPages ? <Link to={listHref({ ...filters, page: String(page + 1) })} className="btn-secondary">{t('catalog.next')}</Link> : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
