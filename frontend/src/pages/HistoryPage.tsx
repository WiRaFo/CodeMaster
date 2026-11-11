import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { Paged, PeriodRef, PublicationDetail, PublicationList, PublicationSummary } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { yearsLabel } from './ExhibitionsPage.tsx';
import { HistoryFolders } from './HomePage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

export function PublicationCard({ p }: { p: PublicationSummary }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const years = p.periodText ?? yearsLabel(p.yearFrom, p.yearTo);
  return (
    <article className="card lift d-col pub-card h-full gap-2.5">
      {/* В карточке обложка оформительская: заголовок рядом, поэтому alt пустой. */}
      {p.cover ? <img src={p.cover.url} alt="" loading="lazy" className="pub-cover" /> : null}
      {years ? <span className="d-row gap-2"><span className="chip">{t('history.years', { years })}</span></span> : null}
      <h3 className="tlink m-0 text-[calc(22px*var(--fs,1))] font-extrabold leading-tight"><Link to={`/${lang}/history/${p.slug}`}>{p.title}</Link></h3>
      {p.lead ? <p className="m-0 text-[calc(17px*var(--fs,1))]">{p.lead}</p> : null}
      {p.topics.length > 0 ? <p className="muted mt-auto mb-0 text-[calc(16px*var(--fs,1))]">{p.topics.map((x) => x.name ?? x.slug).join(', ')}</p> : null}
      <TranslationNote contentLang={p.contentLang} translationStatus={p.translationStatus} />
    </article>
  );
}

/** Горы и река внизу плашки (History.dc.html), чисто декоративно. */
function Mountains() {
  return (
    <svg className="hist-mnt" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 150 L120 90 L210 130 L330 40 L430 110 L540 60 L640 120 L760 20 L880 100 L980 70 L1100 130 L1210 50 L1330 110 L1440 80 L1440 260 L0 260Z" className="m1" />
      <path d="M0 200 L140 150 L260 190 L380 130 L500 180 L620 150 L760 200 L880 140 L1000 190 L1140 150 L1280 200 L1440 160 L1440 260 L0 260Z" className="m2" />
      <path className="river" d="M-20 240 C 200 210, 360 250, 560 226 S 900 206, 1060 234 S 1340 220, 1460 212" fill="none" strokeWidth="3" />
    </svg>
  );
}

/**
 * Цифровая история региона — «Большой архив памяти» (ТЗ §5.6, с. 8; F-080, F-081) в дизайне History.dc.html.
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
      <div className="hist-head">
        <PageHeading title={t('nav.history')} art={<Mountains />}>
          <p className="lead m-0 max-w-[720px]">{t('history.lead')}</p>
        </PageHeading>
      </div>

      <HistoryFolders lang={lang} />

      <section aria-labelledby="history-topics" className="mb-16">
        <h2 id="history-topics" className="h2 mb-5">{t('history.topics')}</h2>
        {all.status === 'ready' ? (
          <ul className="d-grid topics">
            {all.data.topics.map((x) => (
              <li key={x.slug} className="flex">
                {x.count > 0 ? (
                  <Link to={topicHref(x.slug)} aria-current={topic === x.slug ? 'true' : undefined} className="topic on flex-1">
                    <span>{x.name ?? x.slug}</span>
                    <span className="topic-n">{x.count}</span>
                  </Link>
                ) : (
                  <span className="topic off flex-1">
                    <span>{x.name ?? x.slug}</span>
                    <span className="topic-soon whitespace-nowrap">{t('history.soon')}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <LoadStatus status={all.status} />
        )}
      </section>

      <section aria-labelledby="history-pubs">
        <h2 id="history-pubs" className="h2 mb-5">{t('home.publicationsTitle')}</h2>
        <form
          className="card hist-filter"
          aria-label={t('history.filterLabel')}
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
          <label className="hist-f">
            {t('history.period')}
            <select name="period" defaultValue={period} key={`p-${period}`} className="field">
              <option value="">{t('history.any')}</option>
              {periods.status === 'ready' ? periods.data.items.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>) : null}
            </select>
          </label>
          {settlements.length > 0 || settlement ? (
            <label className="hist-f">
              {t('history.settlement')}
              <select name="settlement" defaultValue={settlement} key={`s-${settlement}`} className="field">
                <option value="">{t('history.any')}</option>
                {settlements.map((x) => <option key={x.slug} value={x.slug}>{`${x.name ?? x.slug} (${x.count})`}</option>)}
              </select>
            </label>
          ) : null}
          <button type="submit" className="btn">{t('history.apply')}</button>
          {topic || period || settlement ? <Link to={`/${lang}/history`} className="btn line">{t('history.reset')}</Link> : null}
        </form>

        {list.status !== 'ready' ? (
          <LoadStatus status={list.status} />
        ) : list.data.items.length === 0 ? (
          <p role="status" className="card news-empty">{t('history.empty')}</p>
        ) : (
          <>
            <p role="status" className="mb-4 font-bold">{t('history.found', { count: list.data.total })}</p>
            <ul className="d-grid [--min:320px]">
              {list.data.items.map((p) => <li key={p.slug} className="flex"><PublicationCard p={p} /></li>)}
            </ul>
          </>
        )}
      </section>
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
        {p.cover ? <img src={p.cover.url} alt={p.cover.alt} className="mb-4 w-full rounded-md" /> : null}
        {p.lead ? <p className="mb-4 text-lg">{p.lead}</p> : null}
        {(p.bodyText ?? '').split(/\n{2,}/).filter(Boolean).map((para, i) => <p key={i} className="mb-4 whitespace-pre-line">{para}</p>)}
      </article>
      {p.images && p.images.length > 0 ? (
        <section aria-labelledby="photos-h" className="mb-8">
          <h2 id="photos-h" className="mb-3 text-xl font-semibold">{t('history.photos', { count: p.images.length })}</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {p.images.map((img) => (
              <li key={img.url}>
                <figure lang={img.contentLang ?? undefined}>
                  <img src={img.url} alt={img.alt} loading="lazy" className="w-full rounded-md border border-border" />
                  {img.caption ? <figcaption className="mt-1 text-sm">{img.caption}</figcaption> : null}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
        {p.persons.length > 0 ? (
          <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.persons')}</dt>
            <dd>{p.persons.map((x, i) => <span key={x.slug}>{i > 0 ? ', ' : ''}<Link to={`/${lang}/history/persons/${x.slug}`}>{x.lifeYears ? `${x.fullName} (${x.lifeYears})` : x.fullName}</Link></span>)}</dd></div>
        ) : null}
        {p.events.length > 0 ? (
          <div className="border-b border-border py-2"><dt className="font-semibold">{t('history.events')}</dt>
            <dd><ul>{p.events.map((x) => <li key={x.slug}><Link to={`/${lang}/history/timeline#event-${x.slug}`}>{`${x.year}: ${x.title}`}</Link></li>)}</ul></dd></div>
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
