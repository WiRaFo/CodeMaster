import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { DataOrigin } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  dataOrigin: DataOrigin;
  contentLang: string | null;
  translationStatus: string | null;
}

/**
 * Вопросы и ответы (ТЗ §4, с. 3). Раскрывающиеся блоки на <details>: работают с клавиатуры
 * и экранными дикторами без скриптов. Внизу — ссылки на помощника и на форму отзывов.
 */
export function FaqPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const faq = useApi<{ items: FaqItem[] }>(`/faq?lang=${lang}`);
  return (
    <>
      <PageHeading title={t('nav.faq')}>
        <p className="mt-2 max-w-3xl">{t('faq.lead')}</p>
      </PageHeading>
      {faq.status !== 'ready' ? (
        <LoadStatus status={faq.status} />
      ) : (
        <>
          {faq.data.items.some((f) => f.dataOrigin === 'demo') ? <p className="mb-4 max-w-3xl text-sm text-muted">{t('faq.demoNote')}</p> : null}
          <div className="mb-8 flex max-w-3xl flex-col gap-2">
            {faq.data.items.map((f) => (
              <details key={f.id} className="rounded-md border-2 border-border bg-surface p-3 open:border-primary">
                <summary className="min-h-11 cursor-pointer py-2 font-semibold">{f.question}</summary>
                <p className="mt-2">{f.answer}</p>
                <TranslationNote contentLang={f.contentLang} translationStatus={f.translationStatus} />
              </details>
            ))}
          </div>
        </>
      )}
      <p className="max-w-3xl">
        {t('faq.more')} <Link to={`/${lang}/assistant`}>{t('nav.assistant')}</Link>
        {' · '}
        <Link to={`/${lang}/feedback`}>{t('nav.feedback')}</Link>
      </p>
    </>
  );
}
