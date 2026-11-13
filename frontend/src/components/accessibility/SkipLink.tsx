import { useTranslation } from 'react-i18next';

/** Первый фокусируемый элемент страницы (docs/accessibility.md §3). */
export function SkipLink() {
  const { t } = useTranslation();
  return (
    <a
      href="#main"
      className="skip"
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
