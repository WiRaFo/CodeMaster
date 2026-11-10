import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { RoutePlanner } from '../components/branches/RoutePlanner.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { BranchDetail } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import { VerificationBadge, telHref } from './BranchesPage.tsx';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-3 sm:grid sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
      <dt className="font-semibold">{label}</dt>
      <dd className="min-w-0 break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

/**
 * Карточка подразделения (ТЗ §5.5, с. 7; F-062, F-067): контакты, режим работы, компетенция,
 * зона обслуживания, доступность здания, площадки, основные фонды и маршрут.
 * Пустые поля не выводятся; несверенные сведения помечены, указан источник.
 */
export function BranchPage() {
  const { t } = useTranslation();
  const { lang = 'kk', slug = '' } = useParams();
  const state = useApi<BranchDetail>(`/branches/${encodeURIComponent(slug)}?lang=${lang}`);
  if (state.status === 'error' && state.notFound) return <NotFoundPage />;
  if (state.status !== 'ready') return <LoadStatus status={state.status} />;
  const b = state.data;
  const text = (key: string, value: string | null) => (value ? <Field label={t(key)}>{value}</Field> : null);

  return (
    <>
      <nav aria-label={t('branches.breadcrumbs')} className="mb-2 text-sm">
        <Link to={`/${lang}/branches`}>{t('nav.branches')}</Link>
      </nav>
      <PageHeading title={b.name ?? b.shortName ?? b.slug}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-muted">{b.type.name}</span>
          <VerificationBadge show={b.needsVerification} />
          <OriginBadge origin={b.dataOrigin} />
          <TranslationNote contentLang={b.contentLang} translationStatus={b.translationStatus} />
        </div>
      </PageHeading>

      {b.needsVerification ? <p className="mb-6 max-w-3xl rounded-md border-2 border-border bg-surface p-3">{t('branches.needsVerificationNote')}</p> : null}

      <section aria-labelledby="branch-contacts" className="mb-8">
        <h2 id="branch-contacts" className="mb-2 text-xl font-semibold">{t('branches.contacts')}</h2>
        <dl>
          {b.address ? <Field label={t('branches.address')}>{[b.postalCode, b.address].filter(Boolean).join(', ')}</Field> : null}
          {b.phone ? <Field label={t('branches.phone')}><a href={telHref(b.phone)}>{b.phone}</a></Field> : null}
          {b.email ? <Field label={t('branches.email')}><a href={`mailto:${b.email}`}>{b.email}</a></Field> : null}
          {b.website ? <Field label={t('branches.website')}><a href={b.website} rel="noopener noreferrer">{b.website}</a></Field> : null}
          {text('branches.schedule', b.scheduleText)}
          {text('branches.readingRoom', b.readingRoomSchedule)}
          {b.isMain ? null : b.staff.map((s) => <Field key={s.id} label={s.position}>{s.fullName}</Field>)}
        </dl>
        {b.isMain ? <p className="mt-2"><Link to={`/${lang}/about/structure`}>{t('branches.structureLink')}</Link></p> : null}
      </section>

      {b.address ? <RoutePlanner address={b.address} coordinates={b.coordinates} /> : null}

      <section aria-labelledby="branch-about" className="mb-8">
        <h2 id="branch-about" className="mb-2 text-xl font-semibold">{t('branches.about')}</h2>
        <dl>
          {text('branches.description', b.description)}
          {text('branches.competence', b.competence)}
          {text('branches.serviceArea', b.serviceArea)}
          {text('branches.directions', b.mainDirections)}
          {text('branches.accessibility', b.accessibilityInfo)}
          {b.coordinates ? <Field label={t('branches.coordinates')}>{`${b.coordinates.lat.toFixed(6)}, ${b.coordinates.lng.toFixed(6)}`}</Field> : null}
        </dl>
        {b.highlightedFonds.length > 0 ? (
          <>
            <h3 className="mt-4 mb-2 font-semibold">{t('branches.fonds')}</h3>
            <ul className="list-disc pl-6">
              {b.highlightedFonds.map((f) => <li key={f.id}>{`${f.number}${f.title ? ` — ${f.title}` : ''}`}</li>)}
            </ul>
          </>
        ) : null}
        <p className="mt-4"><Link to={`/${lang}/catalog?branch=${encodeURIComponent(b.slug)}`}>{t('branches.catalogLink')}</Link></p>
      </section>

      {b.sites.length > 0 ? (
        <section aria-labelledby="branch-sites" className="mb-8">
          <h2 id="branch-sites" className="mb-2 text-xl font-semibold">{t('branches.sites')}</h2>
          <ul className="list-disc pl-6">
            {b.sites.map((s) => (
              <li key={s.slug}><Link to={`/${lang}/branches/${s.slug}`}>{s.shortName ?? s.name ?? s.slug}</Link>{s.address ? ` — ${s.address}` : ''}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-muted">
        {b.verifiedAt ? t('branches.verifiedAt', { date: b.verifiedAt }) : null}
        {b.sourceUrl ? (
          <>
            {b.verifiedAt ? ' ' : null}
            {t('branches.source')}: <a href={b.sourceUrl} rel="noopener noreferrer">{b.sourceUrl}</a>
          </>
        ) : null}
      </p>
    </>
  );
}
