import { useTranslation } from 'react-i18next';
import type { DataOrigin } from '../../lib/types.ts';

/**
 * Пометка происхождения записи. По решению заказчика (11.11.2026) на сайте пометки «Демо» и «Тестовые данные»
 * не выводятся; происхождение хранится в data_origin и видно в админке.
 */
export function OriginBadge(_props: { origin: DataOrigin }) {
  return null;
}

/** Предупреждение, что текст показан на другом языке или переведён машинно. */
export function TranslationNote({ contentLang, translationStatus }: { contentLang: string | null; translationStatus: string | null }) {
  const { t, i18n } = useTranslation();
  if (contentLang && contentLang !== i18n.language) {
    return <span className="text-sm text-muted" lang={i18n.language}>{t('content.otherLanguage', { lang: t(`lang.${contentLang}`) })}</span>;
  }
  if (translationStatus === 'machine') return <span className="text-sm text-muted">{t('content.machineTranslation')}</span>;
  return null;
}
