import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { ExhibitionList, Paged, PeriodRef } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

export const yearsLabel = (from: number | null, to: number | null): string | null =>
  from === null && to === null ? null : from === to || to === null ? String(from) : from === null ? String(to) : `${from}–${to}`;

/**
 * Список онлайн-выставок (ТЗ §5.7, с. 9; F-090): фильтр по тематике и историческому периоду.
 * Фильтр — обычная форма с кнопкой «Показать»: состояние хранится в адресе, ссылкой можно поделиться.
 */
export function ExhibitionsPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const topic = params.get('topic') ?? '';
  const period = params.get('period') ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const query = new URLSearchParams({ lang, page: String(page), ...(topic ? { topic } : {}), ...(period ? { period } : {}) });
  const list = useApi<ExhibitionList>(`/exhibitions?${query.toString()}`);
  const periods = useApi<Paged<PeriodRef>>(`/reference/periods?lang=${lang}`);
  const allTopics = useApi<ExhibitionList>(`/exhibitions?lang=${lang}&pageSize=1`);
  const pageLink = (p: number) => `/${lang}/exhibitions?${new URLSearchParams({ ...(topic ? { topic } : {}), ...(period ? { period } : {}), page: String(p) }).toString()}`;

  return (
    <>
      <PageHeading title={t('nav.exhibitions')}>
        <p className="mt-2 max-w-3xl">{t('exhibitions.listLead')}</p>
      </PageHeading>

      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          for (const key of ['topic', 'period']) {
            const v = data.get(key);
            if (typeof v === 'string' && v) next.set(key, v);
          }
          navigate(`/${lang}/exhibitions${next.size ? `?${next.toString()}` : ''}`);
        }}
      >
        <label className="flex min-w-0 flex-col gap-1 font-semibold">
          {t('exhibitions.topic')}
          <select name="topic" defaultValue={topic} key={`t-${topic}`} className="input max-w-full font-normal">
            <option value="">{t('exhibitions.any')}</option>
            {allTopics.status === 'ready'
              ? allTopics.data.topics.map((x) => (
                  <option key={x.slug} value={x.slug}>{x.name ?? x.slug} ({x.count})</option>
                ))
              : null}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 font-semibold">
          {t('exhibitions.period')}
          <select name="period" defaultValue={period} key={`p-${period}`} className="input max-w-full font-normal">
            <option value="">{t('exhibitions.any')}</option>
            {periods.status === 'ready' ? periods.data.items.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>) : null}
          </select>
        </label>
        <button type="submit" className="btn-primary">{t('exhibitions.apply')}</button>
        {topic || period ? <Link to={`/${lang}/exhibitions`} className="btn-secondary no-underline">{t('exhibitions.reset')}</Link> : null}
      </form>

      {list.status !== 'ready' ? (
        <LoadStatus status={list.status} />
      ) : list.data.items.length === 0 ? (
        <p role="status">{t('exhibitions.empty')}</p>
      ) : (
        <>
          <ul className="mb-6 grid gap-4 md:grid-cols-2">
            {list.data.items.map((e) => (
              <li key={e.slug}>
                <article className="relative flex h-full flex-col gap-2 overflow-hidden rounded-md border-2 border-border bg-surface focus-within:border-focus hover:border-primary">
                  {e.coverItem ? (
                    // Обложка декоративная: название выставки — в заголовке-ссылке.
                    <img src={`/api/v1/exhibitions/${e.slug}/items/${e.coverItem}/image`} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
                  ) : null}
                  <div className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      <OriginBadge origin={e.dataOrigin} />
                      {yearsLabel(e.yearFrom, e.yearTo) ? <span>{t('exhibitions.years', { years: yearsLabel(e.yearFrom, e.yearTo) })}</span> : null}
                      <span>{t('exhibitions.itemCount', { count: e.itemCount })}</span>
                    </div>
                    <h2 className="text-xl font-semibold leading-snug">
                      <Link to={`/${lang}/exhibitions/${e.slug}`} className="after:absolute after:inset-0 after:content-['']">{e.title ?? e.slug}</Link>
                    </h2>
                    {e.lead ? <p>{e.lead}</p> : null}
                    {e.topics.length ? <p className="text-sm text-muted">{e.topics.map((x) => x.name ?? x.slug).join(', ')}</p> : null}
                    <TranslationNote contentLang={e.contentLang} translationStatus={e.translationStatus} />
                  </div>
                </article>
              </li>
            ))}
          </ul>
          {list.data.totalPages > 1 ? (
            <nav aria-label={t('catalog.pagination')} className="flex flex-wrap items-center gap-3">
              {page > 1 ? <Link to={pageLink(page - 1)} className="btn-secondary">{t('catalog.prev')}</Link> : null}
              <span>{t('catalog.pageOf', { page, total: list.data.totalPages })}</span>
              {page < list.data.totalPages ? <Link to={pageLink(page + 1)} className="btn-secondary">{t('catalog.next')}</Link> : null}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
