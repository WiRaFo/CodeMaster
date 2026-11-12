import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { SectionKey } from '../lib/sections.ts';

/** Раздел из ТЗ §4, который ещё не реализован: честное сообщение вместо пустой или выдуманной страницы. */
export function SectionStubPage({ section }: { section: SectionKey }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  return (
    <>
      <PageHeading title={t(`nav.${section}`)} />
      <p className="mb-4">{t('stub.text')}</p>
      <Link to={`/${lang}`}>{t('stub.toHome')}</Link>
    </>
  );
}
