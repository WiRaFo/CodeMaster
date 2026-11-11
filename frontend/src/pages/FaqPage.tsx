import { ArrowRight, ChevronDown } from 'lucide-react';
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

/** Раздел по теме вопроса: ссылка показывается под каждым ответом этой темы. */
const TOPIC_LINK: Record<string, string> = { services: 'services', catalog: 'catalog', access: 'catalog', visit: 'visitors', site: 'accessibility' };
/** Разделы, на которые можно сослаться из ответа (название раздела в тексте ответа даёт ссылку). */
const LINKABLE = ['about', 'catalog', 'visitors', 'services', 'history', 'exhibitions', 'news', 'branches', 'assistant', 'feedback', 'accessibility'] as const;

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
              {items.map((f) => (
                <details key={f.id} className="faq-q">
                  <summary>
                    <span>{f.question}</span>
                    <span className="faq-chev" aria-hidden="true"><ChevronDown className="size-5" /></span>
                  </summary>
                  <div className="faq-a">
                    <p className="m-0">{f.answer}</p>
                    <AnswerLinks topic={topic} answer={f.answer} />
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

/** Ссылки на разделы под ответом: раздел темы и разделы, названные в тексте ответа. */
function AnswerLinks({ topic, answer }: { topic: string; answer: string }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const text = answer.toLowerCase();
  const keys = LINKABLE.filter((key) => key === TOPIC_LINK[topic] || text.includes(t(`nav.${key}`).toLowerCase()));
  if (keys.length === 0) return null;
  return (
    <ul className="faq-links" aria-label={t('faq.linksLabel')}>
      {keys.map((key) => (
        <li key={key}><Link to={`/${lang}/${key}`} className="btn ghost sm">{t(`nav.${key}`)}<ArrowRight aria-hidden="true" className="size-4" /></Link></li>
      ))}
    </ul>
  );
}
