import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { setMeta } from '../lib/head.ts';

export interface PageMetaOptions {
  /** Краткое описание страницы для поисковиков; по умолчанию — описание сайта. */
  description?: string;
  /** Не индексировать (страница «не найдено», результаты поиска). */
  noindex?: boolean;
}

/**
 * Заголовок вкладки «Страница — Госархив ВКО» (WCAG 2.4.2) и метаданные для поисковиков и превью ссылок.
 * Фокус на h1 переводит LangLayout при смене маршрута.
 */
export function usePageMeta(title: string, { description, noindex = false }: PageMetaOptions = {}): void {
  const { t, i18n } = useTranslation();
  useEffect(() => {
    const fullTitle = `${title} — ${t('site.shortName')}`;
    const text = description?.trim() ? description.trim().slice(0, 300) : t('site.description');
    document.title = fullTitle;
    setMeta({ name: 'description' }, text);
    setMeta({ name: 'robots' }, noindex ? 'noindex' : null);
    setMeta({ property: 'og:title' }, fullTitle);
    setMeta({ property: 'og:description' }, text);
    setMeta({ property: 'og:site_name' }, t('site.name'));
    setMeta({ property: 'og:type' }, 'website');
    setMeta({ property: 'og:locale' }, ({ kk: 'kk_KZ', ru: 'ru_RU', en: 'en_US' } as Record<string, string>)[i18n.language] ?? 'kk_KZ');
  }, [title, description, noindex, t, i18n.language]);
}
