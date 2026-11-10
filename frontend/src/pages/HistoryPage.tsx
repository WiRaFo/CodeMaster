import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { Paged, PeriodRef, PublicationDetail, PublicationList, PublicationSummary } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { yearsLabel } from './ExhibitionsPage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

function PublicationCard({ p }: { p: PublicationSummary }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const years = p.periodText ?? yearsLabel(p.yearFrom, p.yearTo);
  return (
    <article className="flex h-full flex-col gap-2 rounded-md border-2 border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <OriginBadge origin={p.dataOrigin} />
        {years ? <span className="text-sm text-muted">{t('history.years', { years })}</span> : null}
      </div>
      <h2 className="text-lg font-semibold"><Link to={`/${lang}/history/${p.slug}`}>{p.title}</Link></h2>
      {p.lead ? <p>{p.lead}</p> : null}
      {p.topics.length > 0 ? <p className="mt-auto text-sm text-muted">{p.topics.map((x) => x.name ?? x.slug).join(', ')}</p> : null}
      <TranslationNote contentLang={p.contentLang} translationStatus={p.translationStatus} />
    </article>
  );
}

/**
 * Цифровая история региона — «Большой архив памяти» (ТЗ §5.6, с. 8; F-080, F-081).
 * Тематические направления ТЗ показаны все, с числом публикаций. Фильтры (направление, период,
 * населённый пункт; F-084) хранятся в адресе и сочетаются.
 */
export function HistoryPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const topic = params.get('topic') ?? '';
  const period = params.get('period') ?? '';
  const settlement = params.get('settlement') ?? '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const filters = { ...(topic ? { topic } : {}), ...(period ? { period } : {}), ...(settlement ? { settlement } : {}) };
  const list = useApi<PublicationList>(`/history?${new URLSearchParams({ lang, page: String(page), ...filters }).toString()}`);
  const periods = useApi<Paged<PeriodRef>>(`/reference/periods?lang=${lang}`);
  const all = useApi<PublicationList>(`/history?lang=${lang}&pageSize=1`);
  const topicHref = (slug: string) => `/${lang}/history?${new URLSearchParams({ ...filters, topic: slug }).toString()}`;
  const settlements = all.status === 'ready' ? (all.data.settlements ?? []) : [];

  return (
    <>
      <PageHeading title={t('nav.history')}>
        <p className="mt-2 max-w-3xl">{t('history.lead')}</p>
        <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1"><Link to={`/${lang}/history/timeline`}>{t('timeline.title')}</Link><Link to={`/${lang}/history/persons`}>{t('persons.title')}</Link><Link to={`/${lang}/history/collections`}>{t('collections.title')}</Link><Link to={`/${lang}/history/gallery`}>{t('gallery.title')}</Link><Link to={`/${lang}/calendar`}>{t('calendar.title')}</Link></p>
      </PageHeading>

      <section aria-labelledby="history-topics" className="mb-8">
        <h2 id="history-topics" className="mb-3 text-xl font-semibold">{t('history.topics')}</h2>
        {all.status === 'ready' ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {all.data.topics.map((x) => (
              <li key={x.slug}>
                {x.count > 0 ? (
                  <Link to={topicHref(x.slug)} aria-current={topic === x.slug ? 'true' : undefined} className="flex h-full justify-between gap-2 rounded-md border-2 border-border bg-surface p-3 hover:border-primary aria-[current=true]:border-primary aria-[current=true]:font-semibold">
                    <span>{x.name ?? x.slug}</span>
                    <span className="shrink-0 text-muted">{x.count}</span>
                  </Link>
                ) : (
                  <span className="flex h-full justify-between gap-2 rounded-md border-2 border-dashed border-border p-3 text-muted">
                    <span>{x.name ?? x.slug}</span>
                    <span className="shrink-0 whitespace-nowrap">{t('history.soon')}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <LoadStatus status={all.status} />
        )}
      </section>

      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const picked = (name: string) => {
            const v = form.get(name);
            return typeof v === 'string' && v ? { [name]: v } : {};
          };
          const next = new URLSearchParams({ ...(topic ? { topic } : {}), ...picked('period'), ...picked('settlement') });
          navigate(`/${lang}/history${next.size ? `?${next.toString()}` : ''}`);
        }}
      >
        <label className="flex min-w-0 flex-col gap-1 font-semibold">
          {t('history.period')}
          <select name="period" defaultValue={period} key={`p-${period}`} className="input max-w-full font-normal">
            <option value="">{t('history.any')}</option>
            {periods.status === 'ready' ? periods.data.items.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>) : null}
          </select>
        </label>
        {settlements.length > 0 || settlement ? (
          <label className="flex min-w-0 flex-col gap-1 font-semibold">
            {t('history.settlement')}
            <select name="settlement" defaultValue={settlement} key={`s-${settlement}`} className="input max-w-full font-normal">
              <option value="">{t('history.any')}</option>
              {settlements.map((x) => <option key={x.slug} value={x.slug}>{`${x.name ?? x.slug} (${x.count})`}</option>)}
            </select>
          </label>
        ) : null}
        <button type="submit" className="btn-primary">{t('history.apply')}</button>
        {topic || period || settlement ? <Link to={`/${lang}/history`} className="btn-secondary">{t('history.reset')}</Link> : null}
      </form>

      {list.status !== 'ready' ? (
        <LoadStatus status={list.status} />
      ) : list.data.items.length === 0 ? (
        <p role="status">{t('history.empty')}</p>
      ) : (
        <>
          <p role="status" className="mb-3 font-semibold">{t('history.found', { count: list.data.total })}</p>
          <ul className="grid gap-4 md:grid-cols-2">
            {list.data.items.map((p) => <li key={p.slug}><PublicationCard p={p} /></li>)}
          </ul>
        </>
      )}
    </>
  );
}

/** Публикация (ТЗ §5.6; F-082, F-084): текст, период, тематики, источник, связанный документ каталога. */
export function PublicationPage() {
  const { t } = useTranslation();
  const { lang = 'kk', slug = '' } = useParams();
  const state = useApi<PublicationDetail>(`/history/${encodeURIComponent(slug)}?lang=${lang}`);
  if (state.status === 'error' && state.notFound) return <NotFoundPage />;
  if (state.status !== 'ready') return <LoadStatus status={state.status} />;
  const p = state.data;
  const years = p.periodText ?? yearsLabel(p.yearFrom, p.yearTo);
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: p.title ?? p.slug }]} />
      <PageHeading title={p.title ?? p.slug} meta={{ description: p.lead ?? undefined }}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <OriginBadge origin={p.dataOrigin} />
          {years ? <span className="text-muted">{t('history.years', { years })}</span> : null}
          <TranslationNote contentLang={p.contentLang} translationStatus={p.translationStatus} />
        </div>
      </PageHeading>
      <article className="max-w-[75ch]" lang={p.contentLang ?? undefined}>
        {p.lead ? <p className="mb-4 text-lg">{p.lead}</p> : null}
        {(p.bodyText ?? '').split(/\n{2,}/).filter(Boolean).map((para, i) => <p key={i} className="mb-4 whitespace-pre-line">{para}</p>)}
      </article>
      <dl className="mb-8 max-w-[75ch]">
        {p.topics.length > 0 ? (
          <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.topic')}</dt>
            <dd>{p.topics.map((x, i) => <span key={x.slug}>{i > 0 ? ', ' : ''}<Link to={`/${lang}/history?topic=${x.slug}`}>{x.name ?? x.slug}</Link></span>)}</dd></div>
        ) : null}
        {p.settlements.length > 0 ? (
          <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.settlements')}</dt><dd>{p.settlements.map((x, i) => <span key={x.slug}>{i > 0 ? ', ' : ''}<Link to={`/${lang}/history?settlement=${x.slug}`}>{x.name ?? x.slug}</Link></span>)}</dd></div>
        ) : null}
        {p.document ? (
          <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.document')}</dt>
            <dd><Link to={`/${lang}/catalog/documents/${p.document.id}`}>{`${p.document.code.formatted} — ${p.document.title ?? ''}`}</Link>
              {p.document.access === 'restricted' ? <span className="ml-2 font-semibold">{t('catalog.restricted')}</span> : null}</dd></div>
        ) : null}
        {p.authorship ? <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.authorship')}</dt><dd>{p.authorship}</dd></div> : null}
        {p.sourceNote ? <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.source')}</dt><dd>{p.sourceNote}</dd></div> : null}
        {p.sourceUrl ? <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.sourceUrl')}</dt><dd className="break-words"><a href={p.sourceUrl} rel="noopener noreferrer">{p.sourceUrl}</a></dd></div> : null}
      </dl>
      {p.related.length > 0 ? (
        <section aria-labelledby="related-h">
          <h2 id="related-h" className="mb-3 text-xl font-semibold">{t('history.related')}</h2>
          <ul className="grid gap-4 md:grid-cols-2">{p.related.map((r) => <li key={r.slug}><PublicationCard p={r} /></li>)}</ul>
        </section>
      ) : null}
    </>
  );
}
