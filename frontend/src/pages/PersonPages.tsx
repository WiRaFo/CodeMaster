import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { PersonDetail, PersonSummary } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/**
 * Исторические личности (ТЗ §5.6, F-086). Сейчас это люди из календаря памятных дат архива:
 * на странице — записи календаря о человеке; биографии появятся, когда архив передаст тексты.
 */
export function PersonsPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const state = useApi<{ items: PersonSummary[] }>(`/history/persons?lang=${lang}`);
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: t('persons.title') }]} />
      <PageHeading title={t('persons.title')}>
        <p className="mt-2 max-w-3xl">{t('persons.lead')}</p>
      </PageHeading>
      {state.status !== 'ready' ? <LoadStatus status={state.status} /> : state.data.items.length === 0 ? <p>{t('persons.empty')}</p> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.data.items.map((p) => (
            <li key={p.slug}>
              <Link to={`/${lang}/history/persons/${p.slug}`} className="flex h-full flex-col gap-1 rounded-md border-2 border-border bg-surface p-4 hover:border-primary">
                <span className="text-lg font-semibold" lang={p.contentLang ?? undefined}>{p.fullName}</span>
                {p.lifeYears ? <span className="text-muted">{p.lifeYears}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function PersonPage() {
  const { t } = useTranslation();
  const { lang = 'kk', slug = '' } = useParams();
  const state = useApi<PersonDetail>(`/history/persons/${encodeURIComponent(slug)}?lang=${lang}`);
  if (state.status === 'error' && state.notFound) return <NotFoundPage />;
  if (state.status !== 'ready') return <LoadStatus status={state.status} />;
  const p = state.data;
  const dateLang = p.memorableDates[0]?.contentLang ?? null;
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: t('persons.title'), to: `/${lang}/history/persons` }, { label: p.fullName }]} />
      <PageHeading title={p.fullName}>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {p.lifeYears ? <span className="text-lg text-muted">{p.lifeYears}</span> : null}
          <TranslationNote contentLang={p.contentLang} translationStatus={p.translationStatus} />
        </div>
      </PageHeading>
      {p.biography ? (
        <section aria-labelledby="person-bio" className="mb-8 max-w-[75ch]" lang={p.contentLang ?? undefined}>
          <h2 id="person-bio" className="mb-3 text-xl font-semibold">{t('persons.biography')}</h2>
          {p.biography.split(/\n{2,}/).map((para, i) => <p key={i} className="mb-3">{para}</p>)}
        </section>
      ) : <p className="mb-6 max-w-[75ch]">{t('persons.noBiography')}</p>}
      {p.memorableDates.length > 0 ? (
        <section aria-labelledby="person-dates" className="mb-8 max-w-[75ch]">
          <h2 id="person-dates" className="mb-3 text-xl font-semibold">{t('persons.dates')}</h2>
          {dateLang ? <p className="mb-2"><TranslationNote contentLang={dateLang} translationStatus="reviewed" /></p> : null}
          <ul className="flex flex-col gap-3" lang={dateLang ?? undefined}>
            {p.memorableDates.map((d, i) => (
              <li key={i} className="border-l-4 border-border pl-4">
                <p className="font-semibold">{`${d.dateLabel}, ${d.calendarYear}`}</p>
                <p>{d.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3"><Link to={`/${lang}/calendar?year=${p.memorableDates[0]?.calendarYear ?? ''}`}>{t('calendar.title')}</Link></p>
        </section>
      ) : null}
      {p.memorableDates.length > 0 ? <p className="text-sm text-muted">{t('persons.source')}</p> : null}
    </>
  );
}
