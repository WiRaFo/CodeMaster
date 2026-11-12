import { ArrowRight, BookOpen, Building2, FileSearch, MapPin, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { CatalogSearchForm } from '../components/catalog/CatalogSearchForm.tsx';
import { BlockHeading, LinkCard } from '../components/home/cards.tsx';
import { MonthDates } from '../components/home/MonthDates.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate, formatYears } from '../lib/format.ts';
import type { BranchSummary, HomeData } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/**
 * Главная (ТЗ §5.1, с. 4; docs/requirements-matrix.md F-010 – F-019).
 * Данные — один запрос GET /home и список подразделений; пустые блоки не показываются.
 */
export function HomePage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const home = useApi<HomeData>(`/home?lang=${lang}`);
  const branches = useApi<{ items: BranchSummary[] }>(`/branches?lang=${lang}`);
  const href = (path: string) => `/${lang}/${path}`;

  const quickLinks = [
    { key: 'findDocument', to: href('catalog'), Icon: FileSearch },
    { key: 'certificate', to: href('services'), Icon: BookOpen },
    { key: 'readingRoom', to: href('reading-room'), Icon: Building2 },
    { key: 'findBranch', to: href('branches'), Icon: MapPin },
  ] as const;

  return (
    <>
      <section aria-labelledby="home-banner-title" className="home-banner mb-10 rounded-lg border-2 border-border p-5 sm:p-8">
        <PageHeading title={t('site.name')} id="home-banner-title">
          <p className="mt-2 text-xl font-semibold text-primary">{t('site.tagline')}</p>
          <p className="mt-3 max-w-3xl text-lg">{t('home.intro')}</p>
        </PageHeading>
        <h2 className="visually-hidden">{t('home.quickTitle')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map(({ key, to, Icon }) => (
            <li key={key}>
              <Link to={to} className="quick-link">
                <Icon aria-hidden="true" className="size-6 shrink-0" />
                <span>{t(`home.quick.${key}`)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4">
          <Link to={href('exhibitions')} className="inline-flex min-h-11 items-center gap-2 font-semibold">
            {t('home.toExhibitions')}
            <ArrowRight aria-hidden="true" className="size-5" />
          </Link>
        </p>
      </section>

      <section aria-labelledby="home-catalog" className="mb-10 rounded-lg bg-surface-2 p-5 sm:p-8">
        <BlockHeading id="home-catalog" title={t('home.catalogTitle')} />
        <p className="mb-4 max-w-3xl">{t('home.catalogText')}</p>
        <CatalogSearchForm id="home-catalog-search" large />
        <p className="mt-4">
          <Link to={`${href('catalog')}?filters=open`} className="inline-flex min-h-11 items-center gap-2 font-semibold">
            <Search aria-hidden="true" className="size-5" />
            {t('home.advancedSearch')}
          </Link>
        </p>
      </section>

      {home.status === 'ready' ? (
        <HomeBlocks data={home.data} lang={lang} />
      ) : (
        <div className="mb-10">
          <LoadStatus status={home.status} />
        </div>
      )}

      <section aria-labelledby="home-branches" className="mb-10">
        <BlockHeading id="home-branches" title={t('home.branchesTitle')} moreTo={href('branches')} moreLabel={t('home.allBranches')} />
        {branches.status === 'ready' ? (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {branches.data.items.map((b) => (
                <li key={b.slug} className="rounded-md border-2 border-border bg-surface p-4">
                  <p className="font-semibold">{b.shortName ?? b.name}</p>
                  {b.address ? <p className="mt-1">{b.address}</p> : null}
                  {b.phone ? (
                    <p className="mt-1">
                      <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`}>{b.phone}</a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {branches.data.items.some((b) => b.needsVerification) ? (
              <p className="mt-3 text-sm text-muted">{t('home.branchesNote')}</p>
            ) : null}
          </>
        ) : (
          <LoadStatus status={branches.status} />
        )}
      </section>
    </>
  );
}

function HomeBlocks({ data, lang }: { data: HomeData; lang: string }) {
  const { t } = useTranslation();
  const href = (path: string) => `/${lang}/${path}`;
  const { topics, publications, documents } = data.history;
  const hasHistory = topics.length > 0 || publications.length > 0 || documents.length > 0;

  return (
    <>
      {hasHistory ? (
        <section aria-labelledby="home-history" className="mb-10">
          <BlockHeading id="home-history" title={t('home.historyTitle')} moreTo={href('history')} moreLabel={t('home.allHistory')} />
          {documents.length > 0 ? (
            <>
              <h3 className="mb-3 text-xl font-semibold">{t('home.documentsTitle')}</h3>
              <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {documents.map((d) => (
                  <li key={d.id}>
                    <LinkCard
                      to={href(`catalog/documents/${d.id}`)}
                      title={d.title ?? d.archiveCode.formatted}
                      meta={<OriginBadge origin={d.dataOrigin} />}
                    >
                      <p className="text-sm">{d.archiveCode.formatted}</p>
                      <p className="text-sm text-muted">
                        {[formatYears(d.date), d.hasDigitalCopy ? t('home.digitalCopy') : null].filter(Boolean).join(' · ')}
                      </p>
                      <TranslationNote contentLang={d.contentLang} translationStatus={d.translationStatus} />
                    </LinkCard>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {publications.length > 0 ? (
            <>
              <h3 className="mb-3 text-xl font-semibold">{t('home.publicationsTitle')}</h3>
              <ul className="mb-6 grid gap-3 md:grid-cols-3">
                {publications.map((p) => (
                  <li key={p.slug}>
                    <LinkCard to={href(`history/${p.slug}`)} title={p.title ?? p.slug} meta={<OriginBadge origin={p.dataOrigin} />}>
                      {p.lead ? <p>{p.lead}</p> : null}
                      {p.topics.length > 0 ? <p className="text-sm text-muted">{p.topics.map((x) => x.name).join(', ')}</p> : null}
                    </LinkCard>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {topics.length > 0 ? (
            <>
              <h3 className="mb-3 text-xl font-semibold">{t('home.topicsTitle')}</h3>
              <ul className="flex flex-wrap gap-2">
                {topics.map((x) => (
                  <li key={x.slug}>
                    <Link to={`${href('history')}?topic=${encodeURIComponent(x.slug)}`} className="topic-link">
                      {x.name ?? x.slug}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      <MonthDates />

      {data.exhibitions.length > 0 ? (
        <section aria-labelledby="home-exhibitions" className="mb-10">
          <BlockHeading id="home-exhibitions" title={t('home.exhibitionsTitle')} moreTo={href('exhibitions')} moreLabel={t('home.allExhibitions')} />
          <ul className="grid gap-3 md:grid-cols-3">
            {data.exhibitions.map((e) => (
              <li key={e.slug}>
                <LinkCard to={href(`exhibitions/${e.slug}`)} title={e.title ?? e.slug} meta={<OriginBadge origin={e.dataOrigin} />}>
                  {e.lead ? <p>{e.lead}</p> : null}
                </LinkCard>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.news.length > 0 ? (
        <section aria-labelledby="home-news" className="mb-10">
          <BlockHeading id="home-news" title={t('home.newsTitle')} moreTo={href('news')} moreLabel={t('home.allNews')} />
          <ul className="grid gap-3 md:grid-cols-3">
            {data.news.map((n) => (
              <li key={n.slug}>
                <LinkCard
                  to={href(`news/${n.slug}`)}
                  title={n.title ?? n.slug}
                  meta={
                    <>
                      <time dateTime={n.publishedAt}>{formatDate(n.publishedAt, lang)}</time>
                      <OriginBadge origin={n.dataOrigin} />
                    </>
                  }
                >
                  {n.lead ? <p>{n.lead}</p> : null}
                  <TranslationNote contentLang={n.contentLang} translationStatus={n.translationStatus} />
                </LinkCard>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
