import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { DataOrigin } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

interface FaqItem {
  id: string;
  topic: string;
  question: string;
  answer: string;
  dataOrigin: DataOrigin;
  contentLang: string | null;
  translationStatus: string | null;
}

const TOPICS = ['services', 'catalog', 'access', 'visit', 'site'] as const;

/** Группы в порядке, который задаёт сервер; неизвестная тема попадает в «Работа сайта». */
function groupByTopic(items: FaqItem[]): Array<[string, FaqItem[]]> {
  const groups = new Map<string, FaqItem[]>();
  for (const f of items) {
    const topic = (TOPICS as readonly string[]).includes(f.topic) ? f.topic : 'site';
    groups.set(topic, [...(groups.get(topic) ?? []), f]);
  }
  return [...groups.entries()];
}

/**
 * Вопросы и ответы (ТЗ §4, с. 3), сгруппированы по темам (дополнение к ТЗ §2). Раскрывающиеся блоки на <details>: работают с клавиатуры
 * и экранными дикторами без скриптов. Внизу — ссылки на помощника и на форму отзывов.
 */
export function FaqPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const faq = useApi<{ items: FaqItem[] }>(`/faq?lang=${lang}`);
  return (
    <div className="faq-page">
      <PageHeading title={t('nav.faq')} variant="plain">
        <p className="lead mb-6">{t('faq.lead')}</p>
      </PageHeading>
      {faq.status !== 'ready' ? (
        <LoadStatus status={faq.status} />
      ) : (
        groupByTopic(faq.data.items).map(([topic, items], i) => (
          <section key={topic} aria-labelledby={`faq-${topic}`} className={`faq-group fg${i % 4}`}>
            <h2 id={`faq-${topic}`} className="faq-tab">{t(`faq.topic.${topic}`)}</h2>
            <div className="faq-box">
              {items.map((f, j) => (
                <details key={f.id} className="faq-q" open={i === 0 && j === 0}>
                  <summary>
                    <span>{f.question}</span>
                    <span className="faq-chev" aria-hidden="true"><ChevronDown className="size-5" /></span>
                  </summary>
                  <div className="faq-a">
                    <p className="m-0">{f.answer}</p>
                    <TranslationNote contentLang={f.contentLang} translationStatus={f.translationStatus} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
      <p className="faq-more">
        {t('faq.more')} <Link to={`/${lang}/assistant`}>{t('nav.assistant')}</Link>
        {' · '}
        <Link to={`/${lang}/feedback`}>{t('nav.feedback')}</Link>
      </p>
    </div>
  );
}
