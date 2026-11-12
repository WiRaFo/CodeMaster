import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { SECTIONS, sectionHref } from '../lib/sections.ts';

/** Каркас главной; блоки ТЗ §5.1 (баннер, «История в документах», новости) добавляются на ЭТАПЕ 4. */
export function HomePage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  return (
    <>
      <PageHeading title={t('site.name')}>
        <p className="mt-3 max-w-3xl text-lg text-muted">{t('home.intro')}</p>
      </PageHeading>
      <section aria-labelledby="home-sections">
        <h2 id="home-sections" className="mb-4 text-2xl font-bold">{t('home.sectionsTitle')}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.filter((s) => s.path).map((s) => (
            <li key={s.key}>
              <Link to={sectionHref(lang, s.path)} className="flex min-h-16 items-center rounded-md border-2 border-border bg-surface p-4 font-semibold">
                {t(`nav.${s.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
