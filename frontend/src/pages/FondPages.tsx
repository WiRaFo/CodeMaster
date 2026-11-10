import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { LinkCard } from '../components/home/cards.tsx';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatYears } from '../lib/format.ts';
import type { CaseDetail, FondDetail, FondSummary, InventoryDetail, Paged } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { yearsLabel } from './ExhibitionsPage.tsx';
import { NotFoundPage } from './NotFoundPage.tsx';

/**
 * Навигация по каталогу «архив → фонд → опись → дело → документ» (ТЗ §5.3; F-030) и переход к личным фондам
 * (дополнение к ТЗ §2). Сервер отдаёт только опубликованные открытые и ограниченные уровни: закрытых здесь нет.
 */

const KINDS = ['', 'organization', 'personal', 'collection'] as const;
const PAGE_SIZE = 20;

function AccessBadge({ access }: { access: string }) {
  const { t } = useTranslation();
  return access === 'restricted' ? <span className="badge-warning">{t('catalog.restricted')}</span> : null;
}

export function FondsPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const kind = (KINDS as readonly string[]).includes(params.get('kind') ?? '') ? (params.get('kind') ?? '') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const list = useApi<Paged<FondSummary>>(`/catalog/fonds?lang=${lang}&pageSize=${PAGE_SIZE}&page=${page}${kind ? `&kind=${kind}` : ''}`);
  const href = (k: string, p = 1) => `/${lang}/catalog/fonds${k || p > 1 ? `?${new URLSearchParams({ ...(k ? { kind: k } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}` : ''}`;
  return (
    <>
      <PageHeading title={t('fonds.title')}>
        <p className="mt-2 max-w-3xl">{t('fonds.lead')}</p>
      </PageHeading>
      <nav aria-label={t('fonds.kindFilter')} className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <li key={k || 'all'}>
              <Link to={href(k)} aria-current={k === kind ? 'page' : undefined} className={k === kind ? 'btn-primary' : 'btn-secondary'}>{t(`fonds.kind.${k || 'all'}`)}</Link>
            </li>
          ))}
        </ul>
      </nav>
      {list.status !== 'ready' ? <LoadStatus status={list.status} /> : list.data.items.length === 0 ? (
        <p className="max-w-3xl">{t('fonds.empty')}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">{t('fonds.count', { count: list.data.total })}</p>
          <ul className="mb-6 grid gap-3 md:grid-cols-2">
            {list.data.items.map((f) => (
              <li key={f.id}>
                <LinkCard
                  headingLevel={2}
                  to={`/${lang}/catalog/fonds/${f.id}`}
                  title={f.title ?? f.archiveCode.formatted}
                  meta={<><span>{f.archiveCode.formatted}</span><span>{t(`fonds.kind.${f.kind}`)}</span><AccessBadge access={f.access} /><OriginBadge origin={f.dataOrigin} /></>}
                >
                  <p className="text-sm text-muted">{[yearsLabel(f.years.from, f.years.to), f.branch.name].filter(Boolean).join(', ')}</p>
                  <TranslationNote contentLang={f.contentLang} translationStatus={f.translationStatus} />
                </LinkCard>
              </li>
            ))}
          </ul>
          {list.data.totalPages > 1 ? (
            <nav aria-label={t('catalog.pagination')} className="flex flex-wrap gap-3">
              {page > 1 ? <Link to={href(kind, page - 1)}>{t('catalog.prev')}</Link> : null}
              {page < list.data.totalPages ? <Link to={href(kind, page + 1)}>{t('catalog.next')}</Link> : null}
            </nav>
          ) : null}
        </>
      )}
      <p className="mt-6"><Link to={`/${lang}/catalog`}>{t('fonds.toSearch')}</Link></p>
    </>
  );
}

export function FondPage() {
  const { t } = useTranslation();
  const { lang = 'kk', id = '' } = useParams();
  const fond = useApi<FondDetail>(`/catalog/fonds/${encodeURIComponent(id)}?lang=${lang}`);
  if (fond.status === 'error' && fond.notFound) return <NotFoundPage />;
  if (fond.status !== 'ready') return <LoadStatus status={fond.status === 'error' ? 'error' : 'loading'} />;
  const f = fond.data;
  return (
    <>
      <Breadcrumbs items={[{ label: t('nav.catalog'), to: `/${lang}/catalog` }, { label: t('fonds.title'), to: `/${lang}/catalog/fonds` }, { label: `${t('document.fond')} ${f.number}` }]} />
      <PageHeading title={f.title ?? f.archiveCode.formatted}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-muted">{f.archiveCode.formatted}</span>
          <span className="text-muted">{t(`fonds.kind.${f.kind}`)}</span>
          <AccessBadge access={f.access} />
          <OriginBadge origin={f.dataOrigin} />
          <TranslationNote contentLang={f.contentLang} translationStatus={f.translationStatus} />
        </div>
      </PageHeading>
      <dl className="mb-6 grid max-w-3xl gap-1 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <dt className="font-semibold">{t('fonds.branch')}</dt><dd><Link to={`/${lang}/branches/${f.branch.slug}`}>{f.branch.name}</Link></dd>
        {yearsLabel(f.years.from, f.years.to) ? <><dt className="font-semibold">{t('fonds.years')}</dt><dd>{yearsLabel(f.years.from, f.years.to)}</dd></> : null}
        {f.unitsCount !== null ? <><dt className="font-semibold">{t('fonds.units')}</dt><dd>{f.unitsCount}</dd></> : null}
      </dl>
      {f.annotation ? <p className="mb-4 max-w-[75ch]">{f.annotation}</p> : null}
      {f.historyNote ? <section aria-labelledby="fond-history" className="mb-6 max-w-[75ch]"><h2 id="fond-history" className="mb-2 text-xl font-semibold">{t('fonds.historyNote')}</h2><p>{f.historyNote}</p></section> : null}
      <section aria-labelledby="fond-inventories">
        <h2 id="fond-inventories" className="mb-3 text-xl font-semibold">{t('fonds.inventories')}</h2>
        {f.inventories.length === 0 ? <p>{t('fonds.noInventories')}</p> : (
          <ul className="flex max-w-3xl flex-col gap-2">
            {f.inventories.map((i) => (
              <li key={i.id} className="rounded-md border-2 border-border bg-surface p-3">
                <Link to={`/${lang}/catalog/inventories/${i.id}`} className="font-semibold">{t('document.inventory')} {i.number}{i.title ? `. ${i.title}` : ''}</Link>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted">{yearsLabel(i.years.from, i.years.to)}<AccessBadge access={i.access} /></p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function InventoryPage() {
  const { t } = useTranslation();
  const { lang = 'kk', id = '' } = useParams();
  const inv = useApi<InventoryDetail>(`/catalog/inventories/${encodeURIComponent(id)}?lang=${lang}`);
  if (inv.status === 'error' && inv.notFound) return <NotFoundPage />;
  if (inv.status !== 'ready') return <LoadStatus status={inv.status === 'error' ? 'error' : 'loading'} />;
  const i = inv.data;
  return (
    <>
      <Breadcrumbs items={[
        { label: t('nav.catalog'), to: `/${lang}/catalog` },
        { label: t('fonds.title'), to: `/${lang}/catalog/fonds` },
        { label: `${t('document.fond')} ${i.fond.number}`, to: `/${lang}/catalog/fonds/${i.fond.id}` },
        { label: `${t('document.inventory')} ${i.number}` },
      ]} />
      <PageHeading title={i.title ?? i.archiveCode.formatted}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-muted">{i.archiveCode.formatted}</span>
          <AccessBadge access={i.access} />
          <OriginBadge origin={i.dataOrigin} />
          <TranslationNote contentLang={i.contentLang} translationStatus={i.translationStatus} />
        </div>
      </PageHeading>
      {i.annotation ? <p className="mb-4 max-w-[75ch]">{i.annotation}</p> : null}
      <section aria-labelledby="inv-cases">
        <h2 id="inv-cases" className="mb-3 text-xl font-semibold">{t('fonds.cases')}</h2>
        {i.cases.length === 0 ? <p>{t('fonds.noCases')}</p> : (
          <ul className="flex max-w-3xl flex-col gap-2">
            {i.cases.map((c) => (
              <li key={c.id} className="rounded-md border-2 border-border bg-surface p-3">
                <Link to={`/${lang}/catalog/cases/${c.id}`} className="font-semibold">{t('document.case')} {c.number}{c.title ? `. ${c.title}` : ''}</Link>
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  {[formatYears(c.date), c.sheetCount !== null ? t('fonds.sheets', { count: c.sheetCount }) : null].filter(Boolean).join(', ')}
                  <AccessBadge access={c.access} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function CasePage() {
  const { t } = useTranslation();
  const { lang = 'kk', id = '' } = useParams();
  const kase = useApi<CaseDetail>(`/catalog/cases/${encodeURIComponent(id)}?lang=${lang}`);
  if (kase.status === 'error' && kase.notFound) return <NotFoundPage />;
  if (kase.status !== 'ready') return <LoadStatus status={kase.status === 'error' ? 'error' : 'loading'} />;
  const c = kase.data;
  return (
    <>
      <Breadcrumbs items={[
        { label: t('nav.catalog'), to: `/${lang}/catalog` },
        { label: t('fonds.title'), to: `/${lang}/catalog/fonds` },
        { label: `${t('document.fond')} ${c.fond.number}`, to: `/${lang}/catalog/fonds/${c.fond.id}` },
        { label: `${t('document.inventory')} ${c.inventory.number}`, to: `/${lang}/catalog/inventories/${c.inventory.id}` },
        { label: `${t('document.case')} ${c.number}` },
      ]} />
      <PageHeading title={c.title ?? c.archiveCode.formatted}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-muted">{c.archiveCode.formatted}</span>
          {formatYears(c.date) ? <span className="text-muted">{formatYears(c.date)}</span> : null}
          <AccessBadge access={c.access} />
          <OriginBadge origin={c.dataOrigin} />
          <TranslationNote contentLang={c.contentLang} translationStatus={c.translationStatus} />
        </div>
      </PageHeading>
      {c.annotation ? <p className="mb-4 max-w-[75ch]">{c.annotation}</p> : null}
      <section aria-labelledby="case-docs">
        <h2 id="case-docs" className="mb-3 text-xl font-semibold">{t('fonds.documents')}</h2>
        {c.documents.length === 0 ? <p className="max-w-3xl">{t('fonds.noDocuments')}</p> : (
          <ul className="grid max-w-4xl gap-3">
            {c.documents.map((d) => (
              <li key={d.id}>
                <LinkCard headingLevel={3} to={`/${lang}/catalog/documents/${d.id}`} title={d.title ?? d.archiveCode.formatted}
                  meta={<><span>{d.archiveCode.formatted}</span><AccessBadge access={d.access} /><OriginBadge origin={d.dataOrigin} /></>}>
                  <p className="text-sm text-muted">{[formatYears(d.date), d.type.name, d.hasDigitalCopy ? t('home.digitalCopy') : null].filter(Boolean).join(', ')}</p>
                </LinkCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
