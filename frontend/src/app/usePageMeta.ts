import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/** Заголовок вкладки «Страница — Госархив ВКО» (WCAG 2.4.2). Фокус на h1 переводит LangLayout при смене маршрута. */
export function usePageMeta(title: string): void {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${title} — ${t('site.shortName')}`;
  }, [title, t]);
}
