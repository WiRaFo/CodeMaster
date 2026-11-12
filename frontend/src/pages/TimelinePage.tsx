import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate } from '../lib/format.ts';
import type { TimelineEvent } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

interface TimelineData {
  items: TimelineEvent[];
  documentsByYear: Record<string, number>;
}

/** Описание: абзацы, строки «— …» выводятся списком. */
function Description({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean);
  const paragraphs = lines.filter((l) => !l.startsWith('— '));
  const items = lines.filter((l) => l.startsWith('— ')).map((l) => l.slice(2));
  return (
    <>
      {paragraphs.map((p, i) => <p key={i} className="m-0">{p}</p>)}
      {items.length > 0 ? <ul className="m-0 list-disc pl-6">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
    </>
  );
}

const toYear = (v: string | null) => {
  const n = v ? Number.parseInt(v, 10) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * Интерактивная хронология (ТЗ §5.6, с. 8, F-087; §8.2, D-020): шкала лет с отметками событий, выбор периода
 * (десятилетия или «с … по …»), поиск по событиям, карточка выбранного события со связанными материалами.
 * Всё управляется кнопками и клавишами (← → на шкале), без перетаскивания (A-012); состояние хранится в адресе.
 */
export function TimelinePage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params, setParams] = useSearchParams();
  const state = useApi<TimelineData>(`/history/timeline?lang=${lang}`);
  const all = useMemo(() => (state.status === 'ready' ? state.data.items : []), [state]);
  const docs = state.status === 'ready' ? state.data.documentsByYear : {};

  const minYear = all.length ? Math.floor(all[0]!.year / 10) * 10 : 0;
  const maxYear = all.length ? Math.ceil((all[all.length - 1]!.year + 1) / 10) * 10 : 0;
  const decades = useMemo(() => [...new Set(all.map((e) => Math.floor(e.year / 10) * 10))], [all]);

  const from = toYear(params.get('from')) ?? minYear;
  const to = toYear(params.get('to')) ?? maxYear;
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const filtered = all.filter((e) => e.year >= from && e.year <= to
    && (!q || `${e.title ?? ''} ${e.description ?? ''} ${e.year}`.toLowerCase().includes(q)));
  const selectedSlug = params.get('event');
  const selected = filtered.find((e) => e.slug === selectedSlug) ?? filtered[0] ?? null;
  const index = selected ? filtered.indexOf(selected) : -1;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === null || v === '' ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true, preventScrollReset: true });
  };
  const choose = (e: TimelineEvent) => set({ event: e.slug });
  const step = (delta: number) => {
    const next = filtered[index + delta];
    if (next) choose(next);
  };

  // Выбранная отметка на шкале получает фокус при переходе стрелками, чтобы фокус не терялся.
  const axis = useRef<HTMLDivElement>(null);
  const focusAxis = useRef(false);
  useEffect(() => {
    if (!focusAxis.current || !selected) return;
    focusAxis.current = false;
    axis.current?.querySelector<HTMLButtonElement>(`[data-slug="${selected.slug}"]`)?.focus();
  }, [selected]);
  const onAxisKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    focusAxis.current = true;
    step(event.key === 'ArrowRight' ? 1 : -1);
  };

  const span = Math.max(1, maxYear - minYear);
  const pos = (year: number) => `${((year - minYear) / span) * 100}%`;

  // Шкала как полоса прокрутки видео: щелчок в любое место или перетаскивание выбирает ближайшее событие,
  // при наведении видна подсказка. Это дополнение: те же события выбираются кнопками-отметками и клавишами (A-012).
  const [hover, setHover] = useState<{ x: number; event: TimelineEvent } | null>(null);
  const [dragging, setDragging] = useState(false);
  const nearestAt = (clientX: number) => {
    const rect = axis.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || filtered.length === 0) return null;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const year = minYear + (x / rect.width) * span;
    let best = filtered[0]!;
    for (const e of filtered) if (Math.abs(e.year - year) < Math.abs(best.year - year)) best = e;
    return { x: (x / rect.width) * 100, event: best };
  };
  const scrubTo = (clientX: number) => {
    const hit = nearestAt(clientX);
    if (hit && hit.event.slug !== selected?.slug) choose(hit.event);
    return hit;
  };
  const onScrubDown = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0) return;
    const onDot = (ev.target as HTMLElement).closest('.tl-dot');
    const startX = ev.clientX;
    let moved = !onDot;
    if (!onDot) scrubTo(ev.clientX);
    setDragging(true);
    const move = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - startX) < 4) return;
      moved = true;
      e.preventDefault();
      const hit = scrubTo(e.clientX);
      if (hit) setHover(hit);
    };
    const up = () => {
      setDragging(false);
      setHover(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  // Несколько событий одного года — отметки друг над другом.
  const stackOf = new Map<string, number>();
  const perYear = new Map<number, number>();
  for (const e of all) {
    const n = perYear.get(e.year) ?? 0;
    stackOf.set(e.slug, n);
    perYear.set(e.year, n + 1);
  }
  const ticks: number[] = [];
  for (let y = minYear; y <= maxYear; y += 10) ticks.push(y);
  const yearsOptions = ticks;
  const decadeActive = (d: number) => from === d && to === d + 9;
  const allActive = from === minYear && to === maxYear;

  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: t('timeline.title') }]} />
      <PageHeading title={t('timeline.title')}>
        <p className="lead m-0 max-w-[720px]">{t('timeline.lead')}</p>
      </PageHeading>
      {state.status !== 'ready' ? <LoadStatus status={state.status} /> : all.length === 0 ? <p>{t('timeline.empty')}</p> : (
        <>
          <section className="card tl-controls" aria-label={t('timeline.controls')}>
            <div className="tl-ctl-row">
              <div role="group" aria-label={t('timeline.decades')} className="tl-chips">
                <button type="button" className="tl-chip" aria-pressed={allActive} onClick={() => set({ from: null, to: null, event: null })}>{t('timeline.allYears')}</button>
                {decades.map((d) => (
                  <button key={d} type="button" className="tl-chip" aria-pressed={decadeActive(d)}
                    onClick={() => set(decadeActive(d) ? { from: null, to: null, event: null } : { from: String(d), to: String(d + 9), event: null })}>
                    {t('timeline.decade', { decade: d })}
                  </button>
                ))}
              </div>
            </div>
            <div className="tl-ctl-row">
              <label className="tl-f">{t('timeline.from')}
                <select className="field" value={from} onChange={(e) => set({ from: e.target.value, event: null })}>
                  {yearsOptions.filter((y) => y <= to).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="tl-f">{t('timeline.to')}
                <select className="field" value={to} onChange={(e) => set({ to: e.target.value, event: null })}>
                  {[...yearsOptions.map((y) => y + 9).filter((y) => y >= from && y < maxYear), maxYear].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="tl-f tl-q">{t('timeline.search')}
                <span className="tl-q-in">
                  <Search aria-hidden="true" className="size-5" />
                  <input type="search" className="field" value={params.get('q') ?? ''} maxLength={100} placeholder={t('timeline.searchPlaceholder')}
                    onChange={(e) => set({ q: e.target.value, event: null })} />
                </span>
              </label>
            </div>
            <p role="status" className="m-0 font-bold">{t('timeline.found', { count: filtered.length })}</p>
          </section>

          {/* Шкала: отметки событий по годам; выбранный период подсвечен. */}
          <div className="tl-axis-wrap">
            <div ref={axis} className={`tl-axis${dragging ? ' drag' : ''}`} role="group" aria-label={t('timeline.axis')} onKeyDown={onAxisKey}
              onPointerDown={onScrubDown}
              onPointerMove={(e) => { if (!dragging && e.pointerType === 'mouse') setHover(nearestAt(e.clientX)); }}
              onPointerLeave={() => { if (!dragging) setHover(null); }}>
              <span className="tl-band" style={{ left: pos(from), width: `calc(${pos(Math.min(to + 1, maxYear))} - ${pos(from)})` }} aria-hidden="true" />
              <span className="tl-line" aria-hidden="true" />
              {selected ? <span className="tl-played" style={{ width: pos(selected.year) }} aria-hidden="true" /> : null}
              {hover ? <span className="tl-hover" style={{ left: `${hover.x}%` }} aria-hidden="true" /> : null}
              {selected ? <span className="tl-thumb" style={{ left: pos(selected.year) }} aria-hidden="true" /> : null}
              {hover ? (
                <span className="tl-preview" style={{ left: pos(hover.event.year) }} aria-hidden="true">
                  <b>{hover.event.year}</b> {hover.event.title}
                </span>
              ) : null}
              {all.map((e) => {
                const inRange = filtered.includes(e);
                const isSel = selected?.slug === e.slug;
                return (
                  <button key={e.slug} type="button" data-slug={e.slug}
                    className={`tl-dot${inRange ? '' : ' out'}${isSel ? ' on' : ''}`}
                    style={{ left: pos(e.year), bottom: `${18 + (stackOf.get(e.slug) ?? 0) * 22}px` }}
                    aria-pressed={isSel} disabled={!inRange} tabIndex={isSel || (!selected && inRange) ? 0 : -1}
                    title={`${e.year}: ${e.title ?? ''}`} onClick={() => choose(e)}>
                    <span className="sr-only">{`${e.year}: ${e.title ?? ''}`}</span>
                  </button>
                );
              })}
              {ticks.map((y) => <span key={y} className="tl-tick" style={{ left: pos(y) }} aria-hidden="true">{y}</span>)}
            </div>
            <p className="muted m-0 mt-2 text-[calc(15px*var(--fs,1))]">{t('timeline.axisHint')}</p>
          </div>

          {filtered.length === 0 ? (
            <p className="card news-empty">{t('timeline.nothing')}</p>
          ) : (
            <div className="tl-layout">
              <ol className="tl-list" aria-label={t('timeline.listLabel')}>
                {filtered.map((e) => (
                  <li key={e.slug}>
                    <button type="button" className="tl-item" aria-current={selected?.slug === e.slug ? 'true' : undefined} onClick={() => choose(e)}>
                      <span className="tl-item-y">{e.year}</span>
                      <span className="tl-item-t">{e.title}</span>
                    </button>
                  </li>
                ))}
              </ol>

              {selected ? (
                <article className="card tl-card" aria-labelledby="tl-sel" lang={selected.contentLang ?? undefined} aria-live="polite">
                  <p className="tl-card-y">
                    <time dateTime={selected.date ?? String(selected.year)}>{selected.date && selected.precision === 'day' ? formatDate(selected.date, lang) : selected.year}</time>
                  </p>
                  <h2 id="tl-sel" className="h3 m-0">{selected.title}</h2>
                  <TranslationNote contentLang={selected.contentLang} translationStatus={selected.translationStatus} />
                  {selected.description ? <div className="tl-desc"><Description text={selected.description} /></div> : null}

                  <div className="tl-rel">
                    <p className="font-bold m-0">{t('timeline.related')}</p>
                    <ul className="tl-rel-list">
                      {selected.publications.map((x) => (
                        <li key={x.slug}><Link to={`/${lang}/history/${x.slug}`}>{x.title ?? x.slug}</Link></li>
                      ))}
                      {(docs[String(selected.year)] ?? 0) > 0 ? (
                        <li><Link to={`/${lang}/catalog?yearFrom=${selected.year}&yearTo=${selected.year}`}>{t('timeline.docsOfYear', { count: docs[String(selected.year)], year: selected.year })}</Link></li>
                      ) : (
                        <li><Link to={`/${lang}/catalog?yearFrom=${Math.floor(selected.year / 10) * 10}&yearTo=${Math.floor(selected.year / 10) * 10 + 9}`}>{t('timeline.docsOfDecade', { decade: Math.floor(selected.year / 10) * 10 })}</Link></li>
                      )}
                      <li><Link to={`/${lang}/about#about-history`}>{t('timeline.fullHistory')}</Link></li>
                    </ul>
                  </div>

                  <div className="tl-nav">
                    <button type="button" className="btn ghost sm" disabled={index <= 0} onClick={() => step(-1)}>
                      <ChevronLeft aria-hidden="true" className="size-5" />{t('timeline.prev')}
                    </button>
                    <span className="muted">{t('timeline.position', { n: index + 1, total: filtered.length })}</span>
                    <button type="button" className="btn ghost sm" disabled={index >= filtered.length - 1} onClick={() => step(1)}>
                      {t('timeline.next')}<ChevronRight aria-hidden="true" className="size-5" />
                    </button>
                  </div>
                  {selected.sourceNote ? <p className="muted m-0 text-[calc(15px*var(--fs,1))]">{selected.sourceNote}</p> : null}
                </article>
              ) : null}
            </div>
          )}
        </>
      )}
    </>
  );
}
