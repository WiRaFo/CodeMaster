import { useTranslation } from 'react-i18next';

/** Первый фокусируемый элемент страницы (docs/accessibility.md §3). */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="visually-hidden focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-3 focus:text-text focus:shadow-lg"
      onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById('main');
        main?.focus();
        main?.scrollIntoView();
      }}
    >
      {t('skip.toMain')}
    </a>
  );
}
