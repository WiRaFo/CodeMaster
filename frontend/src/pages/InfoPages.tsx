import { Clock, MapPin, Newspaper, Phone, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { formatDate } from '../lib/format.ts';
import type { AboutInfo, AboutSection, BranchDetail, BranchSummary, HistoryBlock, StaffContact } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { telHref } from './BranchesPage.tsx';
import { InfoBlockView, headingBefore } from './ReferencePage.tsx';

/**
 * Контакты основного архива из реестра подразделений: единый источник, без повторения адресов в тексте.
 * Карточка по дизайну (About.dc.html, Visitors.dc.html): подписи слева сверху, телефон крупно.
 */
export function MainContacts({ withReadingRoom, title, children }: { withReadingRoom: boolean; title?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const main = useApi<BranchDetail>(`/branches/main?lang=${lang}`);
  if (main.status !== 'ready') return <LoadStatus status={main.status} />;
  const b = main.data;
  return (
    <div className="info-card">
      {title ? <h2 className="info-card-h">{title}</h2> : null}
      <p className="m-0 font-bold"><Link to={`/${lang}/branches/main`} className="text-inherit">{b.name}</Link></p>
      <dl className="info-dl">
        {b.address ? (<div><dt>{t('branches.address')}</dt><dd>{b.address}</dd></div>) : null}
        {b.phone ? (<div><dt>{t('branches.phone')}</dt><dd><a href={telHref(b.phone)} className="info-phone"><Phone aria-hidden="true" className="size-5" />{b.phone}</a></dd></div>) : null}
        {b.email ? (<div><dt>{t('branches.email')}</dt><dd className="break-words"><a href={`mailto:${b.email}`}>{b.email}</a></dd></div>) : null}
        {b.scheduleText ? (<div><dt>{t('branches.schedule')}</dt><dd>{b.scheduleText}{withReadingRoom && b.readingRoomSchedule ? <><br />{b.readingRoomSchedule}</> : null}</dd></div>) : null}
      </dl>
      {children}
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

/** «Об архиве» (ТЗ §5.2, с. 5) в дизайне About.dc.html: история по годам, сеть архива, руководство, контакты справа. */
export function AboutPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const about = useApi<AboutInfo>(`/about?lang=${lang}`);
  const branches = useApi<{ items: BranchSummary[] }>(`/branches?lang=${lang}`);
  const ready = about.status === 'ready' ? about.data : null;
  const heads = ready ? ready.staff.slice(0, 7) : [];
  return (
    <>
      <PageHeading title={t('nav.about')}>
        <p className="m-0 max-w-[760px]">{t('about.lead')}</p>
      </PageHeading>
      <div className="about-layout">
        <div className="flex min-w-0 flex-col gap-16">
          <section aria-labelledby="about-history">
            <h2 id="about-history" className="h2 u mb-4">{t('about.historyTitle')}</h2>
            {about.status !== 'ready' ? <LoadStatus status={about.status} /> : ready?.history ? (
              <HistoryYears section={ready.history} />
            ) : <p>{t('about.unavailable')}</p>}
          </section>

          {branches.status === 'ready' ? (
            <section aria-labelledby="about-net">
              <h2 id="about-net" className="h2 mb-6">{t('about.netTitle')}</h2>
              <ul className="stat-row">
                <li className="stat"><span className="stat-n">{branches.data.items.length}</span><span>{t('about.statUnits')}</span></li>
                <li className="stat"><span className="stat-n">3</span><span>{t('about.statLangs')}</span></li>
              </ul>
            </section>
          ) : null}

          {heads.length ? (
            <section aria-labelledby="about-structure">
              <h2 id="about-structure" className="h2 mb-3">{t('about.structureTitle')}</h2>
              <p className="muted mb-6 max-w-[760px]">{t('about.structureLead')}</p>
              <TranslationNote contentLang={heads[0]?.contentLang ?? null} translationStatus={heads[0]?.translationStatus ?? null} />
              <ul className="staff-grid">
                {heads.map((p) => <li key={p.id}><StaffCard person={p} /></li>)}
              </ul>
              <p className="mt-5"><Link to={`/${lang}/about/structure`}>{t('about.structureLink')}</Link></p>
            </section>
          ) : (
            <p><Link to={`/${lang}/about/structure`}>{t('about.structureLink')}</Link></p>
          )}

          {ready ? ready.sections.map((s) => (
            <section key={s.key} aria-labelledby={`about-${s.key.replace('/', '-')}`}>
              <h2 id={`about-${s.key.replace('/', '-')}`} className="h2 mb-4" lang={s.contentLang}>{s.title}</h2>
              <AboutSectionBody section={s} />
            </section>
          )) : null}

          {ready && ready.gallery.length > 0 ? (
            <section aria-labelledby="about-gallery">
              <h2 id="about-gallery" className="h2 mb-6">{t('about.galleryTitle')}</h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ready.gallery.map((img) => (
                  <li key={img.url}>
                    <figure lang={img.contentLang ?? undefined} className="card overflow-hidden">
                      <img src={img.url} alt={img.alt} loading="lazy" width={img.width ?? undefined} height={img.height ?? undefined} className="block h-auto w-full" />
                      {img.caption ? <figcaption className="px-4 py-3 text-[calc(16px*var(--fs,1))]">{img.caption}</figcaption> : null}
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="about-more">
            <h2 id="about-more" className="h2 mb-6">{t('about.moreTitle')}</h2>
            <ul className="tile-grid">
              {([['branches', MapPin], ['catalog', Search], ['history', Clock], ['news', Newspaper]] as const).map(([key, Icon]) => (
                <li key={key}><Link to={`/${lang}/${key}`} className="tile lift"><span className="icon"><Icon aria-hidden="true" className="size-6" /></span>{t(`nav.${key}`)}</Link></li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="about-aside" aria-label={t('about.contactsTitle')}>
          <MainContacts withReadingRoom title={t('about.contactsTitle')}>
            {ready && ready.social.length > 0 ? (
              <div className="info-dl"><div>
                <dt>{t('about.socialTitle')}</dt>
                <dd><ul className="m-0 p-0">{ready.social.map((s) => (
                  <li key={s.network}>{t(`about.network.${s.network}`)}: <a href={s.url} rel="noopener noreferrer">{s.label}</a></li>
                ))}</ul></dd>
              </div></div>
            ) : null}
            <Link to={`/${lang}/branches`} className="btn mt-5 w-full">{t('about.allOnMap')}</Link>
          </MainContacts>
        </aside>
      </div>
    </>
  );
}

/** Сотрудник: отдел меткой, имя, должность, телефон и почта. */
function StaffCard({ person }: { person: StaffContact }) {
  return (
    <div className="staff">
      {person.department ? <span className="chip staff-dep">{person.department}</span> : null}
      <p className="m-0 font-extrabold">{person.fullName}</p>
      <p className="muted m-0">{person.position}</p>
      {person.phone ? <a href={telHref(person.phone)} className="font-bold no-underline">{person.phone}</a> : null}
      {person.email ? <a href={`mailto:${person.email}`} className="wrap-anywhere">{person.email}</a> : null}
    </div>
  );
}

/**
 * История архива по годам (About.dc.html): год берётся из текста абзаца переданной архивом истории;
 * абзацы без года остаются при предыдущем. «Вся история» показывает текст целиком.
 */
function HistoryYears({ section }: { section: AboutSection }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const steps: Array<{ year: string; blocks: AboutSection['blocks'] }> = [];
  for (const block of section.blocks) {
    const text = 'text' in block ? block.text : '';
    const year = block.type === 'p' ? /(1[89]\d\d|20\d\d)/.exec(text)?.[1] : undefined;
    const last = steps[steps.length - 1];
    if (year && (!last || last.year !== year)) steps.push({ year, blocks: [block] });
    else if (last) last.blocks.push(block);
  }
  if (steps.length < 2 || full) {
    return (
      <>
        <AboutSectionBody section={section} />
        {steps.length >= 2 ? <button type="button" className="btn line sm mt-5" onClick={() => setFull(false)}>{t('about.byYears')}</button> : null}
      </>
    );
  }
  const current = steps[index] ?? steps[0];
  if (!current) return null;
  return (
    <div lang={section.contentLang}>
      <TranslationNote contentLang={section.contentLang} translationStatus={section.translationStatus} />
      <p className="muted mb-4">{t('about.pickYear')}</p>
      <div className="year-tape" role="group" aria-label={t('about.yearsLabel')}>
        {steps.map((s, i) => (
          <button key={`${s.year}-${i}`} type="button" className="year-btn" aria-pressed={i === index} onClick={() => setIndex(i)}>
            <span className="year-dot" aria-hidden="true" />{s.year}
          </button>
        ))}
      </div>
      <div className="year-card" aria-live="polite">
        <span className="year-big" aria-hidden="true">{current.year}</span>
        <div className="flex min-w-0 flex-col gap-3">
          {current.blocks.map((block, i) => <InfoBlockView key={i} block={block} headingLevel={3} label={headingBefore(current.blocks, i)} />)}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button type="button" className="btn line sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>← {t('about.earlier')}</button>
        <button type="button" className="btn sm" disabled={index === steps.length - 1} onClick={() => setIndex(index + 1)}>{t('about.later')} →</button>
        <button type="button" className="btn ghost sm" onClick={() => setFull(true)}>{t('about.fullHistory')}</button>
      </div>
    </div>
  );
}

/** Текст раздела «Об архиве»: вводный абзац, блоки с подзаголовками h3, пометка о языке и дата актуализации. */
function AboutSectionBody({ section }: { section: AboutSection }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  return (
    <>
      <TranslationNote contentLang={section.contentLang} translationStatus={section.translationStatus} />
      <div className="mt-2 flex max-w-[75ch] flex-col gap-3" lang={section.contentLang}>
        {section.lead ? <p className="text-lg">{section.lead}</p> : null}
        {section.blocks.map((block, i) => <InfoBlockView key={i} block={block} headingLevel={3} label={headingBefore(section.blocks, i)} />)}
      </div>
      {section.actualizedAt ? <p className="mt-2 text-sm text-muted">{t('about.actualized', { date: formatDate(section.actualizedAt, lang) })}</p> : null}
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
