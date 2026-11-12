import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate } from '../lib/format.ts';
import type { TimelineEvent } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/** События по десятилетиям в порядке времени. */
function byDecade(items: TimelineEvent[]): Array<[number, TimelineEvent[]]> {
  const groups = new Map<number, TimelineEvent[]>();
  for (const e of items) {
    const decade = Math.floor(e.year / 10) * 10;
    groups.set(decade, [...(groups.get(decade) ?? []), e]);
  }
  return [...groups.entries()];
}

/** Описание: абзацы, строки «— …» выводятся списком. */
function Description({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean);
  const paragraphs = lines.filter((l) => !l.startsWith('— '));
  const items = lines.filter((l) => l.startsWith('— ')).map((l) => l.slice(2));
  return (
    <>
      {paragraphs.map((p, i) => <p key={i} className="mb-2">{p}</p>)}
      {items.length > 0 ? <ul className="mb-2 list-disc pl-6">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
    </>
  );
}

/**
 * Хронологическая лента (ТЗ §5.6, F-083). Переход по десятилетиям — ссылками на разделы страницы,
 * без перетаскивания и прокрутки по горизонтали. Сейчас в ленте события истории архива из его собственного текста.
 */
export function TimelinePage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const state = useApi<{ items: TimelineEvent[] }>(`/history/timeline?lang=${lang}`);
  const groups = state.status === 'ready' ? byDecade(state.data.items) : [];
  const first = state.status === 'ready' ? state.data.items[0] : undefined;
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: t('timeline.title') }]} />
      <PageHeading title={t('timeline.title')}>
        <p className="mt-2 max-w-3xl">{t('timeline.lead')}</p>
      </PageHeading>
      {state.status !== 'ready' ? <LoadStatus status={state.status} /> : groups.length === 0 ? <p>{t('timeline.empty')}</p> : (
        <>
          <nav aria-label={t('timeline.decades')} className="mb-6">
            <ul className="flex flex-wrap gap-2">
              {groups.map(([decade]) => (
                <li key={decade}><a href={`#decade-${decade}`} className="btn-secondary">{t('timeline.decade', { decade })}</a></li>
              ))}
            </ul>
          </nav>
          {first ? <p className="mb-4"><TranslationNote contentLang={first.contentLang} translationStatus={first.translationStatus} /></p> : null}
          <div className="flex max-w-[75ch] flex-col gap-8">
            {groups.map(([decade, events]) => (
              <section key={decade} id={`decade-${decade}`} aria-labelledby={`decade-${decade}-h`} className="scroll-mt-24">
                <h2 id={`decade-${decade}-h`} className="mb-3 text-2xl font-semibold">{t('timeline.decade', { decade })}</h2>
                <ol className="flex flex-col gap-5 border-l-4 border-border pl-5">
                  {events.map((e) => (
                    <li key={e.slug}>
                      <article aria-labelledby={`event-${e.slug}`} lang={e.contentLang ?? undefined}>
                        <p className="font-semibold text-primary">
                          <time dateTime={e.date ?? String(e.year)}>{e.date ? formatDate(e.date, lang) : e.year}</time>
                        </p>
                        <h3 id={`event-${e.slug}`} className="mb-2 scroll-mt-24 text-lg font-semibold">{e.title}</h3>
                        {e.description ? <Description text={e.description} /> : null}
                        {e.publications.length > 0 ? (
                          <div className="mt-2">
                            <p className="font-semibold">{t('timeline.publications')}</p>
                            <ul className="list-disc pl-5">{e.publications.map((x) => <li key={x.slug}><Link to={`/${lang}/history/${x.slug}`}>{x.title ?? x.slug}</Link></li>)}</ul>
                          </div>
                        ) : null}
                      </article>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-2 text-sm text-muted">
            {first ? <OriginBadge origin={first.dataOrigin} /> : null}
            <span>{first?.sourceNote ?? null}</span>
          </div>
          <p className="mt-4"><Link to={`/${lang}/about#about-history`}>{t('timeline.fullHistory')}</Link></p>
        </>
      )}
    </>
  );
}
