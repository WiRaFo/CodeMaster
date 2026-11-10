import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { apiGet } from '../../lib/api.ts';
import { SECTIONS, SOCIAL_LINKS, sectionHref } from '../../lib/sections.ts';

interface MainBranch {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  scheduleText: string | null;
  readingRoomSchedule: string | null;
  needsVerification: boolean;
}

type ContactsState = { status: 'loading' } | { status: 'ready'; branch: MainBranch } | { status: 'error' };

/** Подвал: контакты основного архива из API (ТЗ §4, с. 4), разделы, соцсети, информационный характер сайта. */
export function Footer() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [contacts, setContacts] = useState<ContactsState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setContacts({ status: 'loading' });
    apiGet<MainBranch>(`/branches/main?lang=${lang}`, controller.signal)
      .then((branch) => setContacts({ status: 'ready', branch }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('contacts are unavailable', error);
          setContacts({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, [lang]);

  return (
    <footer className="mt-12 border-t border-border bg-surface-2">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:grid-cols-3">
        <section aria-labelledby="footer-contacts">
          <h2 id="footer-contacts" className="mb-3 text-lg font-bold">{t('footer.contacts')}</h2>
          {contacts.status === 'ready' && contacts.branch.needsVerification ? (
            <p className="mb-3"><span className="badge-warning">{t('footer.needsVerification')}</span></p>
          ) : null}
          {contacts.status === 'ready' ? (
            <dl className="flex flex-col gap-2">
              {contacts.branch.address ? (
                <div><dt className="font-semibold">{t('footer.address')}</dt><dd>{contacts.branch.address}</dd></div>
              ) : null}
              {contacts.branch.phone ? (
                <div><dt className="font-semibold">{t('footer.phone')}</dt>
                  <dd><a href={`tel:${contacts.branch.phone.replace(/[^\d+]/g, '')}`}>{contacts.branch.phone}</a></dd></div>
              ) : null}
              {contacts.branch.email ? (
                <div><dt className="font-semibold">{t('footer.email')}</dt>
                  <dd><a href={`mailto:${contacts.branch.email}`}>{contacts.branch.email}</a></dd></div>
              ) : null}
              {contacts.branch.scheduleText ? (
                <div><dt className="font-semibold">{t('footer.schedule')}</dt>
                  <dd>{contacts.branch.scheduleText}{contacts.branch.readingRoomSchedule ? <><br />{contacts.branch.readingRoomSchedule}</> : null}</dd></div>
              ) : null}
            </dl>
          ) : contacts.status === 'error' ? (
            <p>{t('footer.contactsUnavailable')}</p>
          ) : null}
          <p className="mt-3"><Link to={`/${lang}/branches`}>{t('footer.allBranches')}</Link></p>
        </section>

        <nav aria-labelledby="footer-sections">
          <h2 id="footer-sections" className="mb-3 text-lg font-bold">{t('footer.sections')}</h2>
          <ul className="flex flex-col gap-1">
            {SECTIONS.filter((s) => s.path).map((s) => (
              <li key={s.key}><Link to={sectionHref(lang, s.path)}>{t(`nav.${s.key}`)}</Link></li>
            ))}
            <li><Link to={`/${lang}/accessibility`}>{t('nav.accessibility')}</Link></li>
            <li><Link to={`/${lang}/feedback`}>{t('nav.feedback')}</Link></li>
            <li><Link to={`/${lang}/anticorruption`}>{t('anticorruption.title')}</Link></li>
          </ul>
        </nav>

        <section aria-labelledby="footer-social">
          <h2 id="footer-social" className="mb-3 text-lg font-bold">{t('footer.social')}</h2>
          {SOCIAL_LINKS.length ? (
            <ul className="flex flex-col gap-1">
              {SOCIAL_LINKS.map((s) => <li key={s.url}><a href={s.url} rel="noopener noreferrer">{s.name}</a></li>)}
            </ul>
          ) : (
            <p className="text-muted">{t('footer.socialPending')}</p>
          )}
          <p className="mt-4">{t('footer.infoOnly')}</p>
        </section>
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-6 text-sm text-muted">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
