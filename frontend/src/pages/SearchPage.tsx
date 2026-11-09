import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { PageHeading } from '../components/shared/PageHeading.tsx';

/** Общий поиск по сайту (F-007) появится вместе с маршрутом /search API; пока страница показывает запрос. */
export function SearchPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <>
      <PageHeading title={t('search.title')} />
      {q ? <p className="mb-4">{t('search.query', { q })}</p> : null}
      <p className="mb-4">{t('stub.text')}</p>
      <Link to={`/${lang}`}>{t('stub.toHome')}</Link>
    </>
  );
}
