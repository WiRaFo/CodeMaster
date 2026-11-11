import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { ExhibitItem, ExhibitionDetail } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { yearsLabel } from './ExhibitionsPage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

/** Страница выставки (F-090, F-091): описание и оглавление экспонатов по порядку. */
export function ExhibitionPage() {
  const { t } = useTranslation();
  const { lang = 'kk', slug = '' } = useParams();
  const ex = useApi<ExhibitionDetail>(`/exhibitions/${encodeURIComponent(slug)}?lang=${lang}`);

  if (ex.status === 'error' && ex.notFound) return <NotFoundPage />;
  if (ex.status !== 'ready') return <LoadStatus status={ex.status === 'error' ? 'error' : 'loading'} />;
  const e = ex.data;
  const years = yearsLabel(e.yearFrom, e.yearTo);

  return (
    <article>
      <ExhibitionCrumbs lang={lang} item={e.title ?? e.slug} />
      <PageHeading title={e.title ?? e.slug} meta={{ description: e.lead ?? e.description ?? undefined }}>
        {e.lead ? <p className="m-0 max-w-[760px]">{e.lead}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {years ? <span className="chip">{t('exhibitions.years', { years })}</span> : null}
          <span className="chip">{t('exhibitions.itemCount', { count: e.items.length })}</span>
          <TranslationNote contentLang={e.contentLang} translationStatus={e.translationStatus} />
        </div>
      </PageHeading>
      {e.description ? <p className="mb-4 max-w-[760px] text-[calc(19px*var(--fs,1))]">{e.description}</p> : null}
      {e.topics.length ? (
        <p className="mb-6 text-sm">
          <span className="font-semibold">{t('exhibitions.topic')}: </span>
          {e.topics.map((x) => x.name ?? x.slug).join(', ')}
        </p>
      ) : null}
      {e.items.length ? (
        <>
          <Link to={`/${lang}/exhibitions/${e.slug}/1`} className="btn mb-12">{t('exhibitions.start')}<ChevronRight aria-hidden="true" className="size-5" /></Link>
          <section aria-labelledby="exhibition-contents">
            <h2 id="exhibition-contents" className="h2 u mb-8">{t('exhibitions.contents')}</h2>
            <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {e.items.map((item) => (
                <li key={item.number} className="card lift relative flex flex-col gap-2 overflow-hidden p-5">
                  {item.image ? <img src={`/api/v1/exhibitions/${e.slug}/items/${item.number}/image`} alt="" className="mb-2 aspect-[4/3] w-full rounded-xl object-cover" loading="lazy" /> : null}
                  <span className="chip self-start">{t('exhibitions.itemOf', { number: item.number, total: e.items.length })}</span>
                  <h3 className="text-[calc(21px*var(--fs,1))] font-extrabold leading-tight">
                    <Link to={`/${lang}/exhibitions/${e.slug}/${item.number}`} className="after:absolute after:inset-0 after:content-['']">{item.title ?? item.number}</Link>
                  </h3>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </article>
  );
}

function ExhibitionCrumbs({ lang, exhibition, item }: { lang: string; exhibition?: { slug: string; title: string }; item?: string }) {
  const { t } = useTranslation();
  return (
    <Breadcrumbs
      items={[
        { label: t('nav.exhibitions'), to: `/${lang}/exhibitions` },
        ...(exhibition ? [{ label: exhibition.title, to: `/${lang}/exhibitions/${exhibition.slug}` }] : []),
        ...(item ? [{ label: item }] : []),
      ]}
    />
  );
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

/**
 * Отдельный экспонат (F-092): увеличение, переход к соседним экспонатам кнопками-ссылками и стрелками,
 * источник и ссылка на документ каталога, если документ публичен.
 */
export function ExhibitPage() {
  const { lang = 'kk', slug = '', number = '' } = useParams();
  const ex = useApi<ExhibitionDetail>(`/exhibitions/${encodeURIComponent(slug)}?lang=${lang}`);
  const position = Number.parseInt(number, 10);

  if (ex.status === 'error' && ex.notFound) return <NotFoundPage />;
  if (ex.status !== 'ready') return <LoadStatus status={ex.status === 'error' ? 'error' : 'loading'} />;
  const e = ex.data;
  const item = e.items.find((i) => i.number === position);
  if (!item || String(position) !== number) return <NotFoundPage />;
  return <Exhibit key={`${slug}-${position}`} lang={lang} exhibition={e} item={item} />;
}

function Exhibit({ lang, exhibition: e, item }: { lang: string; exhibition: ExhibitionDetail; item: ExhibitItem }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(1);
  const total = e.items.length;
  const href = (n: number) => `/${lang}/exhibitions/${e.slug}/${n}`;
  const hasPrev = item.number > 1;
  const hasNext = item.number < total;
  const zoomBy = (delta: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => hasPrev && navigate(href(item.number - 1)),
      ArrowRight: () => hasNext && navigate(href(item.number + 1)),
      '+': () => zoomBy(ZOOM_STEP),
      '=': () => zoomBy(ZOOM_STEP),
      '-': () => zoomBy(-ZOOM_STEP),
      '0': () => setZoom(1),
    };
    const action = actions[ev.key];
    if (action) {
      ev.preventDefault();
      action();
    }
  };

  const toolbar = (
    <div className="viewer-bar" role="toolbar" aria-label={t('document.viewer.toolbar')} aria-controls="exhibit-stage">
      <nav aria-label={t('exhibitions.contents')} className="flex flex-wrap gap-2.5">
        {hasPrev ? (
          <Link to={href(item.number - 1)} className="ex-nav" rel="prev"><ChevronLeft aria-hidden="true" className="size-5" />{t('exhibitions.prev')}</Link>
        ) : null}
        {hasNext ? (
          <Link to={href(item.number + 1)} className="ex-nav next" rel="next">{t('exhibitions.next')}<ChevronRight aria-hidden="true" className="size-5" /></Link>
        ) : (
          <Link to={href(1)} className="ex-nav next">{t('exhibitions.toStart')}</Link>
        )}
      </nav>
      {item.image ? (
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className="btn-icon" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label={t('document.viewer.zoomOut')}>
            <ZoomOut aria-hidden="true" className="size-6" />
          </button>
          <output className="w-16 text-center tabular-nums" aria-label={t('document.viewer.zoomLevel')}>{Math.round(zoom * 100)}%</output>
          <button type="button" className="btn-icon" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label={t('document.viewer.zoomIn')}>
            <ZoomIn aria-hidden="true" className="size-6" />
          </button>
          <button type="button" className="btn-icon" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label={t('document.viewer.zoomReset')}>
            <RotateCcw aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <article>
      <ExhibitionCrumbs lang={lang} exhibition={{ slug: e.slug, title: e.title ?? e.slug }} item={item.title ?? t('exhibitions.itemOf', { number: item.number, total })} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-3 flex flex-wrap items-center gap-2">
            <span className="chip d" data-testid="exhibit-counter">{t('exhibitions.itemOf', { number: item.number, total })}</span>
            <TranslationNote contentLang={item.contentLang} translationStatus={item.translationStatus} />
          </p>
          <PageHeading variant="plain" title={item.title ?? t('exhibitions.itemOf', { number: item.number, total })} />
        </div>
        <Link to={`/${lang}/exhibitions/${e.slug}`} className="btn ghost mb-7">{t('exhibitions.toExhibition')}</Link>
      </div>

      <div className="ex-layout">
        <div className="min-w-0">
          <div className="document-viewer">
            {toolbar}
            {item.image ? (
              <>
                <div id="exhibit-stage" className="viewer-stage ex-stage" tabIndex={0} role="region" aria-label={t('exhibitions.imageRegion')}
                  aria-describedby="exhibit-keys" onKeyDown={onKeyDown}>
                  <img
                    src={`/api/v1/exhibitions/${e.slug}/items/${item.number}/image`}
                    alt={item.image.alt ?? t('exhibitions.fallbackAlt', { number: item.number })}
                    width={item.image.width ?? undefined}
                    height={item.image.height ?? undefined}
                    style={{ width: `${zoom * 100}%` }}
                    className="viewer-image exhibit-image"
                    draggable={false}
                  />
                </div>
                <p id="exhibit-keys" className="viewer-keys">{t('exhibitions.keys')}</p>
              </>
            ) : (
              <p className="viewer-keys">{t('exhibitions.noImage')}</p>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-5" aria-label={t('exhibitions.source')}>
          {item.description || item.sourceNote || item.document || item.fond ? (
            <div className="info-card">
              {item.description ? <p className="m-0 text-[calc(19px*var(--fs,1))]">{item.description}</p> : null}
              <dl className="info-dl">
                {item.sourceNote ? <div><dt>{t('exhibitions.source')}</dt><dd>{item.sourceNote}</dd></div> : null}
                {item.document ? (
                  <div>
                    <dt>{t('exhibitions.linkedDocument')}</dt>
                    <dd>
                      <Link to={`/${lang}/catalog/documents/${item.document.id}`}>
                        {item.document.code.formatted}
                        {item.document.title ? ` — ${item.document.title}` : ''}
                      </Link>
                      {item.document.access === 'restricted' ? <span className="chip d ml-2">{t('catalog.restricted')}</span> : null}
                    </dd>
                  </div>
                ) : null}
                {item.fond ? <div><dt>{t('exhibitions.linkedFond')}</dt><dd>{item.fond.number}{item.fond.title ? ` — ${item.fond.title}` : ''}</dd></div> : null}
              </dl>
            </div>
          ) : null}
          <section className="ex-toc dark" aria-labelledby="ex-toc">
            <h2 id="ex-toc" className="info-card-h">{t('exhibitions.contents')}</h2>
            <ol className="flex flex-col gap-2">
              {e.items.map((x) => (
                <li key={x.number}>
                  <Link to={href(x.number)} className="ex-toc-item" aria-current={x.number === item.number ? 'page' : undefined}>
                    <span className="ex-toc-n" aria-hidden="true">{x.number}</span>{x.title ?? t('exhibitions.itemOf', { number: x.number, total })}
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </article>
  );
}
