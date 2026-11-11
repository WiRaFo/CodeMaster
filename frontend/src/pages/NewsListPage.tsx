import { Newspaper } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
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
    <div className="news-page">
      <PageHeading variant="plain" title={t('nav.news')} />

      <form role="search" aria-label={t('news.searchLabel')} onSubmit={search} className="field-row mb-[18px]">
        <label htmlFor="news-q" className="sr-only">{t('news.searchLabel')}</label>
        <input id="news-q" type="search" className="field" maxLength={200} value={draft} placeholder={t('news.searchLabel')} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="btn">{t('news.searchButton')}</button>
        {q || rubric ? <Link to={listHref({})} className="btn ghost">{t('news.reset')}</Link> : null}
      </form>

      {news.status === 'ready' && news.data.rubrics?.length ? (
        <nav aria-label={t('news.rubrics')} className="mb-[30px]">
          <ul className="d-row gap-2.5">
            <li>
              <Link to={listHref({ q })} aria-current={rubric === '' ? 'true' : undefined} className="rub">{t('news.allRubrics')}</Link>
            </li>
            {news.data.rubrics.map((r) => (
              <li key={r.slug}>
                <Link to={listHref({ rubric: r.slug, q })} aria-current={rubric === r.slug ? 'true' : undefined} className="rub">
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
          {q || rubric ? <p role="status" className="mb-4 font-bold">{t('news.found', { count: news.data.total })}</p> : <p role="status" className="sr-only" />}
          {news.data.items.length === 0 ? (
            <div className="card news-empty">
              <Newspaper aria-hidden="true" className="size-14 text-[var(--brand)]" strokeWidth={1.6} />
              <p className="m-0 text-[calc(20px*var(--fs,1))] font-bold">{q || rubric ? t('news.nothingFound') : t('news.empty')}</p>
              {q || rubric ? <Link to={listHref({})} className="btn ghost">{t('news.reset')}</Link> : null}
            </div>
          ) : (
            <ul className="mb-6 flex flex-col gap-[18px]">
              {news.data.items.map((n) => {
                const d = new Date(n.publishedAt);
                return (
                  <li key={n.slug}>
                    <article className="news">
                      <div className="cal" aria-hidden="true">
                        <span className="cal-m">{d.toLocaleDateString(locale(lang), { month: 'short' }).replace('.', '')}</span>
                        <span className="cal-d">{String(d.getDate()).padStart(2, '0')}</span>
                        <span className="cal-y">{d.getFullYear()}</span>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2.5">
                        <div className="d-row items-center gap-2">
                          {n.rubric?.name ? <span className="chip">{n.rubric.name}</span> : null}
                          <time className="muted text-[calc(16px*var(--fs,1))]" dateTime={n.publishedAt}>{formatDate(n.publishedAt, lang)}</time>
                        </div>
                        <h2 className="h3 text-[calc(26px*var(--fs,1))]"><Link to={`/${lang}/news/${n.slug}`} className="tlink">{n.title ?? n.slug}</Link></h2>
                        {n.lead ? <p className="m-0">{n.lead}</p> : null}
                        <TranslationNote contentLang={n.contentLang} translationStatus={n.translationStatus} />
                        <Link to={`/${lang}/news/${n.slug}`} className="btn ghost sm self-start">{t('news.readMore')}</Link>
                      </div>
                    </article>
                  </li>
                );
              })}
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
    </div>
  );
}

const locale = (lang: string) => (lang === 'kk' ? 'kk-KZ' : lang === 'en' ? 'en-GB' : 'ru-RU');
