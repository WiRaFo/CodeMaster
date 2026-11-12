import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../lib/analytics.ts';
import { Link, useParams } from 'react-router';
import { PageHeading } from '../components/shared/PageHeading.tsx';

export function NotFoundPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  useEffect(() => reportError('not_found', window.location.pathname), []);
  return (
    <>
      <PageHeading title={t('notFound.title')} meta={{ noindex: true }} />
      <p className="mb-4">{t('notFound.text')}</p>
      <Link to={`/${lang}`}>{t('notFound.toHome')}</Link>
    </>
  );
}
