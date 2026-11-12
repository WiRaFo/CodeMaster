import { useTranslation } from 'react-i18next';
import { PageHeading } from '../components/shared/PageHeading.tsx';

/** Заявление о доступности (docs/accessibility.md §5, §12): панель, клавиатура, известные ограничения. */
export function AccessibilityPage() {
  const { t } = useTranslation();
  // Список из словаря; если ключ окажется не массивом, страница покажет пустой список, а не упадёт.
  const list = (key: string): string[] => {
    const value: unknown = t(key, { returnObjects: true });
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  };
  return (
    <article className="prose-page">
      <PageHeading title={t('nav.accessibility')}>
        <p className="mt-3 text-lg">{t('accessibilityPage.lead')}</p>
      </PageHeading>
      <h2>{t('accessibilityPage.panelTitle')}</h2>
      <p>{t('accessibilityPage.panelText')}</p>
      <h2>{t('accessibilityPage.keyboardTitle')}</h2>
      <ul>{list('accessibilityPage.keyboardItems').map((item) => <li key={item}>{item}</li>)}</ul>
      <h2>{t('accessibilityPage.limitsTitle')}</h2>
      <ul>{list('accessibilityPage.limitsItems').map((item) => <li key={item}>{item}</li>)}</ul>
      <h2>{t('accessibilityPage.feedbackTitle')}</h2>
      <p>{t('accessibilityPage.feedbackText')}</p>
    </article>
  );
}
