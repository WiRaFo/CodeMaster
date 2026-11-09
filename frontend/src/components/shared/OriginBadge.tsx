import { useTranslation } from 'react-i18next';
import type { DataOrigin } from '../../lib/types.ts';

/**
 * Пометка демонстрационных и синтетических записей (бриф, §2: выдуманное не выдаётся за архивное).
 * Для перенесённых и проверенных записей ничего не выводит.
 */
export function OriginBadge({ origin }: { origin: DataOrigin }) {
  const { t } = useTranslation();
  if (origin !== 'demo' && origin !== 'synthetic') return null;
  return (
    <span className="inline-block rounded border border-demo-text bg-demo-bg px-2 py-0.5 text-sm font-semibold text-demo-text">
      {t(`origin.${origin}`)}
    </span>
  );
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
