import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { telHref, useMainBranch } from '../../lib/main-branch.ts';
import { SECTIONS, SOCIAL_LINKS, sectionHref, type SectionKey } from '../../lib/sections.ts';

/** Разделы в первой колонке подвала, остальные — в «Дополнительно» (Footer.dc.html). */
const MAIN_SECTIONS: ReadonlySet<SectionKey> = new Set(['about', 'catalog', 'visitors', 'services', 'history', 'exhibitions', 'news']);
const REFERENCE = ['legislation', 'reading-room', 'symbols', 'links'] as const;

/** Подвал в дизайне 11.11.2026: контакты основного архива из API (ТЗ §4, с. 4), режим работы, соцсети, разделы. */
export function Footer() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const contacts = useMainBranch(lang);
  const branch = contacts.status === 'ready' ? contacts.branch : null;

  return (
    <footer className="ftr">
      <div className="ftr-orn" aria-hidden="true"><div className="orn-band drift" /></div>
      <div className="orn-ros spin ftr-ros" aria-hidden="true" />
      <div className="wrap ftr-in">
        <div className="d-grid ftr-grid">
          <section className="ftr-col" aria-labelledby="footer-contacts">
            <img className="seal pop mb-1.5" src="/design/logo-seal-256.png" alt={t('footer.emblemAlt')} width={112} height={114} />
            <h2 id="footer-contacts" className="ftr-h">{t('footer.contacts')}</h2>
            {branch?.address ? <span>{branch.address}</span> : null}
            {branch?.phone ? <a href={telHref(branch.phone)} className="ftr-phone">{branch.phone}</a> : null}
            {branch?.email ? <a href={`mailto:${branch.email}`}>{branch.email}</a> : null}
            {contacts.status === 'error' ? <span>{t('footer.contactsUnavailable')}</span> : null}
          </section>

          <section className="ftr-col" aria-labelledby="footer-schedule">
            <h2 id="footer-schedule" className="ftr-h">{t('footer.schedule')}</h2>
            {branch?.scheduleText ? <span>{branch.scheduleText}</span> : null}
            {branch?.readingRoomSchedule ? <span>{branch.readingRoomSchedule}</span> : null}
            <Link to={`/${lang}/branches`} className="font-bold">{t('footer.allBranches')}</Link>
            <h2 className="ftr-h mt-3">{t('footer.social')}</h2>
            {SOCIAL_LINKS.length ? (
              <span className="d-row">
                {SOCIAL_LINKS.map((s) => <a key={s.url} href={s.url} rel="noopener noreferrer">{s.name}</a>)}
              </span>
            ) : (
              <span>{t('footer.socialPending')}</span>
            )}
          </section>

          <nav className="ftr-col" aria-labelledby="footer-sections">
            <h2 id="footer-sections" className="ftr-h">{t('footer.sections')}</h2>
            {SECTIONS.filter((s) => MAIN_SECTIONS.has(s.key)).map((s) => (
              <Link key={s.key} to={sectionHref(lang, s.path)}>{t(`nav.${s.key}`)}</Link>
            ))}
          </nav>

          <nav className="ftr-col" aria-labelledby="footer-more">
            <h2 id="footer-more" className="ftr-h">{t('footer.more')}</h2>
            {SECTIONS.filter((s) => s.path && !MAIN_SECTIONS.has(s.key)).map((s) => (
              <Link key={s.key} to={sectionHref(lang, s.path)}>{t(`nav.${s.key}`)}</Link>
            ))}
            <Link to={`/${lang}/accessibility`}>{t('nav.accessibility')}</Link>
            <Link to={`/${lang}/feedback`}>{t('nav.feedback')}</Link>
            <Link to={`/${lang}/anticorruption`}>{t('anticorruption.title')}</Link>
            {REFERENCE.map((key) => <Link key={key} to={`/${lang}/${key}`}>{t(`reference.nav.${key}`)}</Link>)}
          </nav>
        </div>
        <p className="ftr-note">{t('footer.infoOnly')}</p>
        <p className="ftr-copy">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
