import { LOCALES } from '@archive-vko/shared/enums';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';

const LABELS = { kk: 'KZ', ru: 'RU', en: 'EN' } as const;

/** Переключатель KZ / RU / EN (ТЗ §4, с. 3): ведёт на ту же страницу на другом языке. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const { lang } = useParams();
  const { pathname, search } = useLocation();
  const rest = pathname.replace(/^\/[^/]+/, '');
  return (
    <nav aria-label={t('lang.label')} className={`lang ${className}`}>
      {LOCALES.map((code) => (
        <Link
          key={code}
          to={`/${code}${rest}${search}`}
          lang={code}
          hrefLang={code}
          aria-current={code === lang ? 'true' : undefined}
          title={t(`lang.${code}`)}
        >
          {LABELS[code]}
        </Link>
      ))}
    </nav>
  );
}
