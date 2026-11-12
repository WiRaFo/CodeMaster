import { Mail, MapPin, Phone } from 'lucide-react';
import { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import type { MapPoint } from '../components/branches/BranchMap.tsx';
import { SchemeMap } from '../components/branches/SchemeMap.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { BranchSummary } from '../lib/types.ts';
import { dataOrPrevious, useApi } from '../lib/useApi.ts';

const BranchMap = lazy(() => import('../components/branches/BranchMap.tsx'));

export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** Пометка «сведения уточняются» для записей, не сверенных архивом. */
/** Пометка «требует уточнения» на сайте не выводится (решение заказчика 11.11.2026); признак остаётся в админке. */
export function VerificationBadge(_props: { show: boolean }) {
  return null;
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
      <PageHeading title={t('nav.branches')} variant="plain">
        <p className="lead mb-3">{t('branches.listLead')}</p>
        <p className="muted mb-6 max-w-[860px]">
          {t('branches.basis')}{' '}
          <a href="/files/documents/postanovlenie-142-2026.pdf" type="application/pdf">{t('branches.basisLink')}</a>
        </p>
      </PageHeading>

      <form
        role="search"
        aria-label={t('branches.searchForm')}
        className="card br-filter"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          const v = data.get('q');
          if (typeof v === 'string' && v.trim()) next.set('q', v.trim());
          if (type) next.set('type', type);
          navigate(`/${lang}/branches${next.size ? `?${next.toString()}` : ''}`);
        }}
      >
        <label htmlFor="br-q" className="label">{t('branches.search')}</label>
        <div className="br-filter-row">
          <div className="field-row min-w-0 flex-[1_1_420px]">
            <input id="br-q" type="search" name="q" defaultValue={q} key={`q-${q}`} maxLength={100} className="field" placeholder={t('branches.searchPlaceholder')} />
            <button type="submit" className="btn">{t('branches.apply')}</button>
          </div>
          <nav className="br-types" aria-label={t('branches.type')}>
            {[['', t('branches.any')] as const, ...types].map(([code, name]) => (
              <Link key={code || 'all'} to={`/${lang}/branches?${new URLSearchParams({ ...(q ? { q } : {}), ...(code ? { type: code } : {}) }).toString()}`}
                className="br-type" aria-current={type === code ? 'true' : undefined}>{name}</Link>
            ))}
          </nav>
        </div>
        {q || type ? <Link to={`/${lang}/branches`} className="btn line sm mt-4">{t('branches.reset')}</Link> : null}
      </form>

      {points.length > 0 ? (
        <div className="mb-6">
          <h2 className="visually-hidden">{t('branches.mapTitle')}</h2>
          <p className="mb-2 text-sm text-muted">{t('branches.mapNote')}</p>
          <Suspense fallback={<div className="branch-map" />}>
            <BranchMap points={points} label={t('branches.mapTitle')} />
          </Suspense>
        </div>
      ) : all.status === 'ready' ? (
        <section aria-labelledby="br-scheme" className="mb-8">
          <h2 id="br-scheme" className="h3 mb-1">{t('branchMap.title')}</h2>
          <p className="muted mb-4">{t('branchMap.lead')}</p>
          <SchemeMap branches={all.data.items} lang={lang} />
        </section>
      ) : null}

      {items === null ? (
        <LoadStatus status={list.status === 'ready' ? 'loading' : list.status} />
      ) : (
        <>
          <p role="status" className="mb-6 font-bold">{t('branches.found', { count: items.length })}</p>
          {items.length === 0 ? (
            <p className="card news-empty">{t('branches.empty')}</p>
          ) : (
            <ul className="br-grid" aria-busy={list.status === 'loading'}>
              {items.map((b, i) => (
                <li key={b.slug} className="flex">
                  <article className={b.isMain ? 'br-card main' : 'br-card'}>
                    <span className="br-tab" aria-hidden="true">{`№ ${i + 1} · ${b.type.name ?? ''}`}</span>
                    <div className="br-body">
                      <p className="sr-only">{b.type.name}</p>
                      <h2 className="br-name">
                        <Link to={`/${lang}/branches/${b.slug}`}>{b.name ?? b.shortName ?? b.slug}</Link>
                      </h2>
                      <TranslationNote contentLang={b.contentLang} translationStatus={b.translationStatus} />
                      {b.address ? (
                        <p className="br-line"><MapPin aria-hidden="true" className="br-ico" /><span><span className="visually-hidden">{t('branches.address')}: </span>{b.address}</span></p>
                      ) : null}
                      {b.phone ? (
                        <p className="br-line"><Phone aria-hidden="true" className="br-ico" /><span><span className="visually-hidden">{t('branches.phone')}: </span><a href={telHref(b.phone)} className="font-bold">{b.phone}</a></span></p>
                      ) : null}
                      {b.email ? (
                        <p className="br-line"><Mail aria-hidden="true" className="br-ico" /><span className="min-w-0 wrap-anywhere"><span className="visually-hidden">{t('branches.email')}: </span><a href={`mailto:${b.email}`}>{b.email}</a></span></p>
                      ) : null}
                      <Link to={`/${lang}/branches/${b.slug}`} className="btn line sm mt-auto self-start" aria-hidden="true" tabIndex={-1}>{t('branches.more')}</Link>
                    </div>
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
