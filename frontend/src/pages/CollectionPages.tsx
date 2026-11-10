import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { DocumentCard } from '../components/catalog/DocumentCard.tsx';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { CollectionDetail, CollectionSummary } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/** Тематические коллекции «Архива памяти» (ТЗ §5.6, F-081): подборки документов и личностей. */
export function CollectionsPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const state = useApi<{ items: CollectionSummary[] }>(`/history/collections?lang=${lang}`);
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: t('collections.title') }]} />
      <PageHeading title={t('collections.title')}>
        <p className="mt-2 max-w-3xl">{t('collections.lead')}</p>
      </PageHeading>
      {state.status !== 'ready' ? <LoadStatus status={state.status} /> : state.data.items.length === 0 ? <p>{t('collections.empty')}</p> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {state.data.items.map((c) => (
            <li key={c.slug}>
              <article className="flex h-full flex-col gap-2 rounded-md border-2 border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <OriginBadge origin={c.dataOrigin} />
                  <span className="text-sm text-muted">{t('collections.count', { count: c.itemCount })}</span>
                </div>
                <h2 className="text-lg font-semibold"><Link to={`/${lang}/history/collections/${c.slug}`}>{c.title}</Link></h2>
                {c.description ? <p>{c.description}</p> : null}
                <TranslationNote contentLang={c.contentLang} translationStatus={c.translationStatus} />
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function CollectionPage() {
  const { t } = useTranslation();
  const { lang = 'kk', slug = '' } = useParams();
  const state = useApi<CollectionDetail>(`/history/collections/${encodeURIComponent(slug)}?lang=${lang}`);
  if (state.status === 'error' && state.notFound) return <NotFoundPage />;
  if (state.status !== 'ready') return <LoadStatus status={state.status} />;
  const c = state.data;
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.history'), to: `/${lang}/history` }, { label: t('collections.title'), to: `/${lang}/history/collections` }, { label: c.title ?? c.slug }]} />
      <PageHeading title={c.title ?? c.slug} meta={{ description: c.description ?? undefined }}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <OriginBadge origin={c.dataOrigin} />
          <TranslationNote contentLang={c.contentLang} translationStatus={c.translationStatus} />
        </div>
        {c.description ? <p className="mt-2 max-w-3xl">{c.description}</p> : null}
      </PageHeading>
      {c.documents.length > 0 ? (
        <section aria-labelledby="collection-docs" className="mb-8">
          <h2 id="collection-docs" className="mb-3 text-xl font-semibold">{t('collections.documents')}</h2>
          <ul className="grid gap-3">{c.documents.map((d) => <li key={d.id}><DocumentCard lang={lang} doc={d} /></li>)}</ul>
        </section>
      ) : null}
      {c.persons.length > 0 ? (
        <section aria-labelledby="collection-persons" className="mb-8">
          <h2 id="collection-persons" className="mb-3 text-xl font-semibold">{t('persons.title')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {c.persons.map((p) => (
              <li key={p.slug}>
                <Link to={`/${lang}/history/persons/${p.slug}`} className="flex h-full flex-col gap-1 rounded-md border-2 border-border bg-surface p-4 hover:border-primary">
                  <span className="font-semibold" lang={p.contentLang ?? undefined}>{p.fullName}</span>
                  {p.lifeYears ? <span className="text-muted">{p.lifeYears}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
