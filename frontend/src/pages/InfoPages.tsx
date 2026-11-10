import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import type { AboutInfo, BranchDetail, HistoryBlock, StaffContact } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { VerificationBadge, telHref } from './BranchesPage.tsx';

/** Контакты основного архива из реестра подразделений: единый источник, без повторения адресов в тексте. */
function MainContacts({ withReadingRoom }: { withReadingRoom: boolean }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const main = useApi<BranchDetail>(`/branches/main?lang=${lang}`);
  if (main.status !== 'ready') return <LoadStatus status={main.status} />;
  const b = main.data;
  return (
    <div className="rounded-md border-2 border-border bg-surface p-4">
      <p className="mb-2 flex flex-wrap items-center gap-2 font-semibold">
        <Link to={`/${lang}/branches/main`}>{b.name}</Link>
        <VerificationBadge show={b.needsVerification} />
      </p>
      <dl className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)]">
        {b.address ? (<><dt className="font-semibold">{t('branches.address')}</dt><dd>{b.address}</dd></>) : null}
        {b.sites.map((s) => (<Fragment key={s.slug}><dt className="font-semibold">{t('branches.sites')}</dt><dd><Link to={`/${lang}/branches/${s.slug}`}>{s.address ?? s.shortName}</Link></dd></Fragment>))}
        {b.phone ? (<><dt className="font-semibold">{t('branches.phone')}</dt><dd><a href={telHref(b.phone)}>{b.phone}</a></dd></>) : null}
        {b.email ? (<><dt className="font-semibold">{t('branches.email')}</dt><dd className="break-words"><a href={`mailto:${b.email}`}>{b.email}</a></dd></>) : null}
        {b.scheduleText ? (<><dt className="font-semibold">{t('branches.schedule')}</dt><dd>{b.scheduleText}</dd></>) : null}
        {withReadingRoom && b.readingRoomSchedule ? (<><dt className="font-semibold">{t('branches.readingRoom')}</dt><dd>{b.readingRoomSchedule}</dd></>) : null}
      </dl>
    </div>
  );
}

/**
 * «Посетителям» (ТЗ §5.4, с. 6–7; F-050, F-054): как подготовиться к визиту, используя только то, что
 * делает сам сайт, и контакты из реестра. Правила читального зала и перечень услуг архива
 * не выдумываются: они появятся после передачи архивом действующих редакций (Q-25).
 */
export function VisitorsPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const steps = ['find', 'code', 'access', 'contact'] as const;
  return (
    <>
      <PageHeading title={t('nav.visitors')}>
        <p className="mt-2 max-w-3xl">{t('visitors.lead')}</p>
      </PageHeading>
      <p className="mb-6 max-w-3xl rounded-md border-2 border-warning-text bg-warning-bg p-3 text-warning-text">{t('visitors.infoOnly')}</p>
      <section aria-labelledby="visit-steps" className="mb-8 max-w-3xl">
        <h2 id="visit-steps" className="mb-3 text-xl font-semibold">{t('visitors.stepsTitle')}</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-6">
          {steps.map((s) => <li key={s}>{t(`visitors.steps.${s}`)}</li>)}
        </ol>
        <p className="mt-3 flex flex-wrap gap-2">
          <Link to={`/${lang}/catalog`} className="btn-secondary">{t('nav.catalog')}</Link>
          <Link to={`/${lang}/faq`} className="btn-secondary">{t('nav.faq')}</Link>
          <Link to={`/${lang}/assistant`} className="btn-secondary">{t('nav.assistant')}</Link>
        </p>
      </section>
      <section aria-labelledby="visit-contacts" className="mb-8 max-w-3xl">
        <h2 id="visit-contacts" className="mb-3 text-xl font-semibold">{t('visitors.contactsTitle')}</h2>
        <MainContacts withReadingRoom />
        <p className="mt-3"><Link to={`/${lang}/branches`}>{t('visitors.allBranches')}</Link></p>
      </section>
      <p className="max-w-3xl text-sm text-muted">{t('visitors.pending')}</p>
    </>
  );
}

/** «Об архиве» (ТЗ §5.2, с. 5): контакты из реестра, соцсети и история из сведений, переданных архивом. */
export function AboutPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const about = useApi<AboutInfo>(`/about?lang=${lang}`);
  return (
    <>
      <PageHeading title={t('nav.about')}>
        <p className="mt-2 max-w-3xl">{t('about.lead')}</p>
      </PageHeading>
      <section aria-labelledby="about-contacts" className="mb-8 max-w-3xl">
        <h2 id="about-contacts" className="mb-3 text-xl font-semibold">{t('about.contactsTitle')}</h2>
        <MainContacts withReadingRoom />
        {about.status === 'ready' && about.data.social.length > 0 ? (
          <>
            <h3 className="mt-4 mb-2 font-semibold">{t('about.socialTitle')}</h3>
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {about.data.social.map((s) => (
                <li key={s.network}>{t(`about.network.${s.network}`)}: <a href={s.url} rel="noopener noreferrer">{s.label}</a></li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="mt-4"><Link to={`/${lang}/about/structure`}>{t('about.structureLink')}</Link></p>
      </section>
      <section aria-labelledby="about-history" className="mb-8">
        <h2 id="about-history" className="mb-3 text-xl font-semibold">{t('about.historyTitle')}</h2>
        {about.status !== 'ready' ? <LoadStatus status={about.status} /> : about.data.history ? (
          <>
            <TranslationNote contentLang={about.data.history.contentLang} translationStatus={about.data.history.translationStatus} />
            <div className="mt-2 flex max-w-[75ch] flex-col gap-3" lang={about.data.history.contentLang}>
              {about.data.history.blocks.map((block, i) => <HistoryBlockView key={i} block={block} />)}
            </div>
            <p className="mt-4 text-sm text-muted">{t('about.source')}</p>
          </>
        ) : <p>{t('about.unavailable')}</p>}
      </section>
      <section aria-labelledby="about-more" className="mb-8 max-w-3xl">
        <h2 id="about-more" className="mb-3 text-xl font-semibold">{t('about.moreTitle')}</h2>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li><Link to={`/${lang}/branches`}>{t('nav.branches')}</Link></li>
          <li><Link to={`/${lang}/catalog`}>{t('nav.catalog')}</Link></li>
          <li><Link to={`/${lang}/history`}>{t('nav.history')}</Link></li>
          <li><Link to={`/${lang}/news`}>{t('nav.news')}</Link></li>
        </ul>
      </section>
    </>
  );
}

export function HistoryBlockView({ block }: { block: HistoryBlock }) {
  if (!('items' in block)) return block.type === 'h' ? <h3 className="mt-2 text-lg font-semibold">{block.text}</h3> : <p>{block.text}</p>;
  const items = block.items.map((item, i) => <li key={i}>{item}</li>);
  return block.type === 'ol'
    ? <ol className="flex list-decimal flex-col gap-1 pl-6">{items}</ol>
    : <ul className="flex list-disc flex-col gap-1 pl-6">{items}</ul>;
}

/** «Структура и руководство» (ТЗ §5.2): руководство и отделы основного архива, сгруппированные по отделам. */
export function StructurePage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const about = useApi<AboutInfo>(`/about?lang=${lang}`);
  const groups = new Map<string, StaffContact[]>();
  if (about.status === 'ready') {
    for (const s of about.data.staff) {
      const key = s.department ?? '';
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
  }
  return (
    <>
      <nav aria-label={t('branches.breadcrumbs')} className="mb-2 text-sm">
        <Link to={`/${lang}/about`}>{t('nav.about')}</Link>
      </nav>
      <PageHeading title={t('about.structureTitle')}>
        <p className="mt-2 max-w-3xl">{t('about.structureLead')}</p>
      </PageHeading>
      {about.status !== 'ready' ? <LoadStatus status={about.status} /> : groups.size === 0 ? <p>{t('about.unavailable')}</p> : (
        <div className="flex max-w-3xl flex-col gap-6">
          {[...groups].map(([department, people]) => (
            <section key={department} aria-label={department || t('about.structureTitle')}>
              {department ? <h2 className="mb-2 text-xl font-semibold">{department}</h2> : null}
              <TranslationNote contentLang={people[0]?.contentLang ?? null} translationStatus={people[0]?.translationStatus ?? null} />
              <ul className="mt-1 flex flex-col gap-3">
                {people.map((p) => (
                  <li key={p.id} className="rounded-md border-2 border-border bg-surface p-3">
                    <p className="font-semibold">{p.fullName}</p>
                    <p>{p.position}</p>
                    {p.phone ? <p><a href={telHref(p.phone)}>{p.phone}</a></p> : null}
                    {p.email ? <p className="wrap-anywhere"><a href={`mailto:${p.email}`}>{p.email}</a></p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-sm text-muted">{t('about.source')}</p>
        </div>
      )}
    </>
  );
}
