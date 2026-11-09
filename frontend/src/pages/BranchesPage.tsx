import { Mail, MapPin, Phone } from 'lucide-react';
import { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { MapPoint } from '../components/branches/BranchMap.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { BranchSummary } from '../lib/types.ts';
import { dataOrPrevious, useApi } from '../lib/useApi.ts';

const BranchMap = lazy(() => import('../components/branches/BranchMap.tsx'));

export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Пометка «сведения уточняются» для записей, не сверенных архивом. */
export function VerificationBadge({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return <span className="inline-block rounded border border-warning-text bg-warning-bg px-2 py-0.5 text-sm font-semibold text-warning-text">{t('branches.needsVerification')}</span>;
}

/**
 * Филиалы и контакты (ТЗ §5.5, с. 7–8; F-060, F-061, F-066). Список доступен всегда; карта
 * появляется, только если у отобранных подразделений есть сверенные координаты. Поиск и фильтр
 * хранятся в адресе и меняют и список, и маркеры.
 */
export function BranchesPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const type = params.get('type') ?? '';
  const query = new URLSearchParams({ lang, ...(q ? { q } : {}), ...(type ? { type } : {}) });
  const list = useApi<{ items: BranchSummary[] }>(`/branches?${query.toString()}`);
  const all = useApi<{ items: BranchSummary[] }>(`/branches?lang=${lang}`);
  const items = dataOrPrevious(list)?.items ?? null;

  const types = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of all.status === 'ready' ? all.data.items : []) seen.set(b.type.code, b.type.name ?? b.type.code);
    return [...seen];
  }, [all]);
  const points = useMemo<MapPoint[]>(
    () =>
      (items ?? []).flatMap((b) =>
        b.coordinates ? [{ ...b.coordinates, slug: b.slug, name: b.shortName ?? b.name ?? b.slug, href: `/${lang}/branches/${b.slug}`, isMain: b.isMain }] : [],
      ),
    [items, lang],
  );

  return (
    <>
      <PageHeading title={t('nav.branches')}>
        <p className="mt-2 max-w-3xl">{t('branches.listLead')}</p>
      </PageHeading>

      <form
        role="search"
        aria-label={t('branches.searchForm')}
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          for (const key of ['q', 'type']) {
            const v = data.get(key);
            if (typeof v === 'string' && v.trim()) next.set(key, v.trim());
          }
          navigate(`/${lang}/branches${next.size ? `?${next.toString()}` : ''}`);
        }}
      >
        <label className="flex min-w-0 flex-col gap-1 font-semibold">
          {t('branches.search')}
          <input type="search" name="q" defaultValue={q} key={`q-${q}`} maxLength={100} className="input max-w-full font-normal" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 font-semibold">
          {t('branches.type')}
          <select name="type" defaultValue={type} key={`t-${type}-${types.length}`} className="input max-w-full font-normal">
            <option value="">{t('branches.any')}</option>
            {types.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <button type="submit" className="btn-primary">{t('branches.apply')}</button>
        {q || type ? <Link to={`/${lang}/branches`} className="btn-secondary">{t('branches.reset')}</Link> : null}
      </form>

      {points.length > 0 ? (
        <div className="mb-6">
          <h2 className="visually-hidden">{t('branches.mapTitle')}</h2>
          <p className="mb-2 text-sm text-muted">{t('branches.mapNote')}</p>
          <Suspense fallback={<div className="branch-map" />}>
            <BranchMap points={points} label={t('branches.mapTitle')} />
          </Suspense>
        </div>
      ) : items ? (
        <p className="mb-6 rounded-md border-2 border-border bg-surface p-3 text-sm" data-testid="map-pending">{t('branches.mapPending')}</p>
      ) : null}

      {items === null ? (
        <LoadStatus status={list.status === 'ready' ? 'loading' : list.status} />
      ) : (
        <>
          <p role="status" className="mb-3 font-semibold">{t('branches.found', { count: items.length })}</p>
          {items.length === 0 ? (
            <p>{t('branches.empty')}</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2" aria-busy={list.status === 'loading'}>
              {items.map((b) => (
                <li key={b.slug}>
                  <article className="flex h-full flex-col gap-2 rounded-md border-2 border-border bg-surface p-4">
                    <p className="text-sm text-muted">{b.type.name}</p>
                    <h2 className="text-lg font-semibold">
                      <Link to={`/${lang}/branches/${b.slug}`}>{b.name ?? b.shortName ?? b.slug}</Link>
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <VerificationBadge show={b.needsVerification} />
                      <TranslationNote contentLang={b.contentLang} translationStatus={b.translationStatus} />
                    </div>
                    {b.address ? (
                      <p className="flex gap-2"><MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span><span className="visually-hidden">{t('branches.address')}: </span>{b.address}</span></p>
                    ) : null}
                    {b.phone ? (
                      <p className="flex gap-2"><Phone aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span><span className="visually-hidden">{t('branches.phone')}: </span><a href={telHref(b.phone)}>{b.phone}</a></span></p>
                    ) : null}
                    {b.email ? (
                      <p className="flex gap-2"><Mail aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span className="min-w-0 break-words"><span className="visually-hidden">{t('branches.email')}: </span><a href={`mailto:${b.email}`}>{b.email}</a></span></p>
                    ) : null}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
