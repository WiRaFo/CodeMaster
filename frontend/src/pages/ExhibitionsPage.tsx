import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
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
      <PageHeading variant="plain" title={t('nav.exhibitions')}>
        <p className="lead m-0 max-w-[760px]">{t('exhibitions.listLead')}</p>
      </PageHeading>

      <form
        className="ex-filter"
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
        <label className="label flex-[1_1_300px]">
          {t('exhibitions.topic')}
          <select name="topic" defaultValue={topic} key={`t-${topic}`} className="field font-medium">
            <option value="">{t('exhibitions.any')}</option>
            {allTopics.status === 'ready'
              ? allTopics.data.topics.map((x) => (
                  <option key={x.slug} value={x.slug}>{x.name ?? x.slug} ({x.count})</option>
                ))
              : null}
          </select>
        </label>
        <label className="label flex-[1_1_300px]">
          {t('exhibitions.period')}
          <select name="period" defaultValue={period} key={`p-${period}`} className="field font-medium">
            <option value="">{t('exhibitions.any')}</option>
            {periods.status === 'ready' ? periods.data.items.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>) : null}
          </select>
        </label>
        <button type="submit" className="btn">{t('exhibitions.apply')}</button>
        {topic || period ? <Link to={`/${lang}/exhibitions`} className="btn ghost">{t('exhibitions.reset')}</Link> : null}
      </form>

      {list.status !== 'ready' ? (
        <LoadStatus status={list.status} />
      ) : list.data.items.length === 0 ? (
        <p role="status">{t('exhibitions.empty')}</p>
      ) : (
        <>
          <ul className="ex-grid">
            {list.data.items.map((e, i) => (
              <li key={e.slug}>
                <article className="ex-card lift">
                  {/* Веер карточек декоративный: название выставки — в заголовке-ссылке. */}
                  <div className={i % 2 ? 'ex-cover alt' : 'ex-cover'} aria-hidden="true">
                    <img className="ph ph0" src="/design/exhibit-card-1.webp" alt="" loading="lazy" />
                    <img className="ph ph1" src="/design/exhibit-card-2.webp" alt="" loading="lazy" />
                    <img className="ph ph2" src={e.coverItem ? `/api/v1/exhibitions/${e.slug}/items/${e.coverItem}/image` : '/design/exhibit-card-3.webp'} alt="" loading="lazy" />
                  </div>
                  <div className="flex flex-col gap-3 p-7">
                    <div className="flex flex-wrap items-center gap-2">
                      {yearsLabel(e.yearFrom, e.yearTo) ? <span className="chip">{t('exhibitions.years', { years: yearsLabel(e.yearFrom, e.yearTo) })}</span> : null}
                      <span className="chip">{t('exhibitions.itemCount', { count: e.itemCount })}</span>
                    </div>
                    <h2 className="ex-title">
                      <Link to={`/${lang}/exhibitions/${e.slug}`} className="after:absolute after:inset-0 after:content-['']">{e.title ?? e.slug}</Link>
                    </h2>
                    {e.lead ? <p className="m-0">{e.lead}</p> : null}
                    {e.topics.length ? <p className="muted m-0 text-[calc(17px*var(--fs,1))]">{t('exhibitions.topic')}: {e.topics.map((x) => x.name ?? x.slug).join(', ')}</p> : null}
                    <TranslationNote contentLang={e.contentLang} translationStatus={e.translationStatus} />
                    <span className="btn mt-1.5 self-start" aria-hidden="true">{t('exhibitions.start')}<ArrowRight className="size-5" /></span>
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
