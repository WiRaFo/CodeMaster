import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <OriginBadge origin={e.dataOrigin} />
          {years ? <span className="text-muted">{t('exhibitions.years', { years })}</span> : null}
          <span className="text-muted">{t('exhibitions.itemCount', { count: e.items.length })}</span>
          <TranslationNote contentLang={e.contentLang} translationStatus={e.translationStatus} />
        </div>
      </PageHeading>
      {e.lead ? <p className="mb-4 max-w-3xl text-lg">{e.lead}</p> : null}
      {e.description ? <p className="mb-4 max-w-3xl">{e.description}</p> : null}
      {e.topics.length ? (
        <p className="mb-6 text-sm">
          <span className="font-semibold">{t('exhibitions.topic')}: </span>
          {e.topics.map((x) => x.name ?? x.slug).join(', ')}
        </p>
      ) : null}
      {e.items.length ? (
        <>
          <Link to={`/${lang}/exhibitions/${e.slug}/1`} className="btn-primary mb-8 no-underline">{t('exhibitions.start')}</Link>
          <section aria-labelledby="exhibition-contents">
            <h2 id="exhibition-contents" className="mb-3 text-2xl font-bold">{t('exhibitions.contents')}</h2>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {e.items.map((item) => (
                <li key={item.number} className="relative rounded-md border-2 border-border bg-surface p-3 focus-within:border-focus hover:border-primary">
                  {item.image ? <img src={`/api/v1/exhibitions/${e.slug}/items/${item.number}/image`} alt="" className="mb-2 aspect-[4/3] w-full object-cover" loading="lazy" /> : null}
                  <span className="text-sm text-muted">{t('exhibitions.itemOf', { number: item.number, total: e.items.length })}</span>
                  <h3 className="font-semibold">
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

  return (
    <article>
      <ExhibitionCrumbs lang={lang} exhibition={{ slug: e.slug, title: e.title ?? e.slug }} item={item.title ?? t('exhibitions.itemOf', { number: item.number, total })} />
      <PageHeading title={item.title ?? t('exhibitions.itemOf', { number: item.number, total })}>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold" data-testid="exhibit-counter">{t('exhibitions.itemOf', { number: item.number, total })}</span>
          <OriginBadge origin={e.dataOrigin} />
          <TranslationNote contentLang={item.contentLang} translationStatus={item.translationStatus} />
        </div>
      </PageHeading>

      <nav aria-label={t('exhibitions.contents')} className="mb-4 flex flex-wrap items-center gap-2">
        {hasPrev ? (
          <Link to={href(item.number - 1)} className="btn-secondary no-underline" rel="prev">
            <ChevronLeft aria-hidden="true" className="size-5" />
            {t('exhibitions.prev')}
          </Link>
        ) : null}
        {hasNext ? (
          <Link to={href(item.number + 1)} className="btn-primary no-underline" rel="next">
            {t('exhibitions.next')}
            <ChevronRight aria-hidden="true" className="size-5" />
          </Link>
        ) : (
          <Link to={href(1)} className="btn-primary no-underline">{t('exhibitions.toStart')}</Link>
        )}
        <Link to={`/${lang}/exhibitions/${e.slug}`} className="btn-secondary no-underline">{t('exhibitions.toExhibition')}</Link>
      </nav>

      {item.image ? (
        <div className="document-viewer mb-6">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-2" role="toolbar" aria-label={t('document.viewer.toolbar')} aria-controls="exhibit-stage">
            <button type="button" className="btn-icon" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label={t('document.viewer.zoomOut')}>
              <ZoomOut aria-hidden="true" className="size-6" />
            </button>
            <output className="w-14 text-center tabular-nums" aria-label={t('document.viewer.zoomLevel')}>{Math.round(zoom * 100)}%</output>
            <button type="button" className="btn-icon" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label={t('document.viewer.zoomIn')}>
              <ZoomIn aria-hidden="true" className="size-6" />
            </button>
            <button type="button" className="btn-icon" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label={t('document.viewer.zoomReset')}>
              <RotateCcw aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div
            id="exhibit-stage"
            className="viewer-stage"
            tabIndex={0}
            role="region"
            aria-label={t('exhibitions.imageRegion')}
            aria-describedby="exhibit-keys"
            onKeyDown={onKeyDown}
          >
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
          <p id="exhibit-keys" className="p-2 text-sm text-muted">{t('exhibitions.keys')}</p>
        </div>
      ) : (
        <p className="mb-6 text-muted">{t('exhibitions.noImage')}</p>
      )}

      {item.description ? <p className="mb-6 max-w-3xl text-lg">{item.description}</p> : null}

      <dl className="document-meta max-w-3xl">
        {item.sourceNote ? (
          <div>
            <dt>{t('exhibitions.source')}</dt>
            <dd>{item.sourceNote}</dd>
          </div>
        ) : null}
        {item.document ? (
          <div>
            <dt>{t('exhibitions.linkedDocument')}</dt>
            <dd>
              <Link to={`/${lang}/catalog/documents/${item.document.id}`}>
                {item.document.code.formatted}
                {item.document.title ? ` — ${item.document.title}` : ''}
              </Link>
              {item.document.access === 'restricted' ? <span className="badge-warning ml-2">{t('catalog.restricted')}</span> : null}
            </dd>
          </div>
        ) : null}
        {item.fond ? (
          <div>
            <dt>{t('exhibitions.linkedFond')}</dt>
            <dd>
              {item.fond.number}
              {item.fond.title ? ` — ${item.fond.title}` : ''}
            </dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
