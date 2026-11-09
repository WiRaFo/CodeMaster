import { LOCALES } from '@archive-vko/shared/enums';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';

const LABELS = { kk: 'KZ', ru: 'RU', en: 'EN' } as const;

/** Переключатель KZ / RU / EN (ТЗ §4, с. 3): ведёт на ту же страницу на другом языке. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const { lang } = useParams();
  const { pathname, search } = useLocation();
  const rest = pathname.replace(/^\/[^/]+/, '');
  return (
    <nav aria-label={t('lang.label')}>
      <ul className="flex gap-1">
        {LOCALES.map((code) => (
          <li key={code}>
            <Link
              to={`/${code}${rest}${search}`}
              lang={code}
              hrefLang={code}
              aria-current={code === lang ? 'true' : undefined}
              className="lang-link"
            >
              <abbr title={t(`lang.${code}`)} className="no-underline">{LABELS[code]}</abbr>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
