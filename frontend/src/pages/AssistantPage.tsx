import { Send } from 'lucide-react';
import { LOCALES, type Locale } from '@archive-vko/shared/enums';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isLocale } from '../i18n/index.ts';
import { Link, useParams, useSearchParams } from 'react-router';
import { OriginBadge } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { ApiRequestError, apiGet } from '../lib/api.ts';
import { useMainBranch } from '../lib/main-branch.ts';
import { SECTIONS, sectionHref } from '../lib/sections.ts';
import type { AssistantAnswer, AssistantDocument, AssistantRecognized, AssistantSection } from '../lib/types.ts';
import { VerificationBadge, telHref } from './BranchesPage.tsx';

type Turn = { id: number; question: string; lang: Locale } & ({ state: 'loading' } | { state: 'error'; tooMany: boolean } | { state: 'ready'; answer: AssistantAnswer });

/** Язык ответа помощника; без него подписи идут на языке страницы. */
const AnswerLang = createContext<Locale | null>(null);
function useAnswerT() {
  const lng = useContext(AnswerLang);
  return useTranslation(undefined, lng ? { lng } : {});
}

const EXAMPLES = ['photos', 'service', 'term', 'branch'] as const;

function SectionLinks({ links }: { links: AssistantSection[] }) {
  const { t } = useAnswerT();
  const { lang = 'kk' } = useParams();
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {links.map((key) => {
        const path = SECTIONS.find((s) => s.key === key)?.path ?? key;
        return (
          <li key={key}>
            <Link to={sectionHref(lang, path)} className="btn ghost sm">{t(`nav.${key}`)}</Link>
          </li>
        );
      })}
    </ul>
  );
}

function RecognizedList({ items }: { items: AssistantRecognized[] }) {
  const { t } = useAnswerT();
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <p className="font-bold">{t('assistant.understood')}</p>
      <ul className="mt-1 flex flex-wrap gap-2" data-testid="recognized">
        {items.map((r) => (
          <li key={`${r.kind}-${r.text}`} className="asst-chip">
            <span className="text-muted">{t(`assistant.kinds.${r.kind}`)}: </span>
            {r.kind === 'years' ? (r.yearFrom === r.yearTo ? String(r.yearFrom) : `${r.yearFrom}–${r.yearTo}`) : r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Документы ответа: шифр и название ссылкой на карточку, вид, годы, доступ, пометка демо. */
function DocumentList({ documents, label }: { documents: AssistantDocument[]; label: string }) {
  const { t } = useAnswerT();
  const { lang = 'kk' } = useParams();
  return (
    <ol className="mt-2 flex flex-col gap-2" aria-label={label}>
      {documents.map((d) => (
        <li key={d.id} className="asst-item">
          <Link to={`/${lang}/catalog/documents/${d.id}`}>{[d.code, d.title].filter(Boolean).join(' — ')}</Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            {d.type ? <span className="text-muted">{d.type}</span> : null}
            {d.date.from ? <span className="text-muted">{d.date.from.slice(0, 4)}{d.date.to && d.date.to.slice(0, 4) !== d.date.from.slice(0, 4) ? `–${d.date.to.slice(0, 4)}` : ''}</span> : null}
            {d.access === 'restricted' ? <span className="font-semibold">{t('catalog.restricted')}</span> : null}
            <OriginBadge origin={d.dataOrigin} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Дополнение от локальной модели ИИ; без модели блока нет. */
function SemanticDocuments({ documents }: { documents: AssistantDocument[] | undefined }) {
  const { t } = useAnswerT();
  if (!documents?.length) return null;
  return (
    <div className="mt-4">
      <p className="font-semibold">{t('catalog.semantic.title')}</p>
      <p className="text-sm text-muted">{t('catalog.semantic.note')}</p>
      <DocumentList documents={documents} label={t('catalog.semantic.title')} />
    </div>
  );
}

function Answer({ answer }: { answer: AssistantAnswer }) {
  const { t } = useAnswerT();
  const { lang = 'kk' } = useParams();
  switch (answer.intent) {
    case 'service_request':
      return (<><p>{t('assistant.answers.service')}</p><SectionLinks links={answer.links} /></>);
    case 'navigation':
      return (<><p>{t('assistant.answers.navigation')}</p><SectionLinks links={answer.links} /></>);
    case 'unknown':
      return (<><p>{t('assistant.answers.unknown')}</p><SectionLinks links={answer.links} /><SemanticDocuments documents={answer.semantic} /></>);
    case 'term':
      return (
        <>
          <p>{t(`assistant.terms.${answer.term}`)}</p>
          <p className="mt-1 text-sm text-muted">{t('assistant.answers.termNote')}</p>
          <SectionLinks links={answer.links} />
        </>
      );
    case 'branch':
      return (
        <>
          <RecognizedList items={answer.recognized} />
          <p>{t('assistant.answers.branches')}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {answer.branches.map((b) => (
              <li key={b.slug} className="asst-item">
                <Link to={`/${lang}/branches/${b.slug}`} className="text-[calc(20px*var(--fs,1))] font-extrabold">{b.name ?? b.slug}</Link>{' '}
                <VerificationBadge show={b.needsVerification} />
                {b.address ? <p>{b.address}</p> : null}
                {b.phone ? <p className="mt-1"><a href={telHref(b.phone)} className="text-[calc(22px*var(--fs,1))] font-extrabold">{b.phone}</a></p> : null}
                {b.email ? <p className="break-words"><a href={`mailto:${b.email}`}>{b.email}</a></p> : null}
              </li>
            ))}
          </ul>
          <SectionLinks links={answer.links} />
        </>
      );
    case 'search': {
      const catalog = (query: string) => `/${lang}/catalog${query ? `?${query}` : ''}`;
      return (
        <>
          <RecognizedList items={answer.recognized} />
          {answer.total === 0 ? (
            <>
              <p>{t('assistant.answers.noData')}</p>
              <p className="mt-2"><Link to={catalog(answer.requestedQuery)}>{t('assistant.answers.openCatalog')}</Link></p>
            </>
          ) : (
            <>
              {answer.dropped.length > 0 ? (
                <p className="mb-1">{t('assistant.answers.relaxed', { what: answer.dropped.map((d) => t(`assistant.dropped.${d}`)).join(', ') })}</p>
              ) : null}
              <p>{t('assistant.answers.found', { count: answer.total })}</p>
              <DocumentList documents={answer.documents} label={t('assistant.sources')} />
              <p className="mt-2"><Link to={catalog(answer.catalogQuery)} className="font-semibold">{t('assistant.answers.allResults')}</Link></p>
              {answer.suggestions.length > 0 ? (
                <>
                  <p className="mt-3">{t('assistant.answers.suggestions')}</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {answer.suggestions.map((s) => (
                      <li key={s.reason}><Link to={catalog(s.query)} className="btn ghost sm">{t(`assistant.suggest.${s.reason}`)}</Link></li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
          <SemanticDocuments documents={answer.semantic} />
        </>
      );
    }
  }
}

const LANG_SHORT: Record<Locale, string> = { kk: 'KZ', ru: 'RU', en: 'EN' };

/** Ответ на выбранном языке: подписи ответа берутся из словаря этого языка; ссылки остаются в текущей языковой версии сайта. */
function AnswerIn({ lang, children }: { lang: Locale; children: ReactNode }) {
  return <div lang={lang} className="flex flex-col gap-2.5"><AnswerLang.Provider value={lang}>{children}</AnswerLang.Provider></div>;
}

/**
 * Архивный помощник (ТЗ §5.8 А, Б; F-120–F-125). Работает по правилам: разбирает вопрос и показывает
 * только открытые материалы сайта со ссылками. Заявления не принимает (§5.8, с. 10; F-122).
 * Вопрос можно передать в адресе (?q=), чтобы поделиться ссылкой или прийти из поиска.
 */
export function AssistantPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const counter = useRef(0);
  const asked = useRef<string | null>(null);

  const load = (id: number, q: string, answerLang: Locale) => {
    apiGet<AssistantAnswer>(`/assistant/ask?${new URLSearchParams({ q, lang: answerLang }).toString()}`)
      .then((answer) => setTurns((list) => list.map((x) => (x.id === id ? { id, question: q, lang: answerLang, state: 'ready', answer } : x))))
      .catch((error: unknown) => {
        const tooMany = error instanceof ApiRequestError && error.status === 429;
        setTurns((list) => list.map((x) => (x.id === id ? { id, question: q, lang: answerLang, state: 'error', tooMany } : x)));
      });
  };

  const ask = (question: string) => {
    const q = question.trim().slice(0, 300);
    if (!q) return;
    const id = ++counter.current;
    const pageLang: Locale = isLocale(lang) ? lang : 'kk';
    setTurns((list) => [...list, { id, question: q, lang: pageLang, state: 'loading' }]);
    setDraft('');
    load(id, q, pageLang);
  };

  /** Тот же вопрос, ответ на другом языке (переключатель в карточке ответа). */
  const switchLang = (turn: Turn, next: Locale) => {
    if (turn.lang === next) return;
    setTurns((list) => list.map((x) => (x.id === turn.id ? { id: x.id, question: x.question, lang: next, state: 'loading' } : x)));
    load(turn.id, turn.question, next);
  };

  useEffect(() => {
    const q = params.get('q');
    if (q && asked.current !== q) {
      asked.current = q;
      ask(q);
    }
    // ask зависит только от языка; повторный запрос — только при новом q в адресе.
  }, [params]);

  const main = useMainBranch(lang);
  const phone = main.status === 'ready' ? main.branch.phone : null;

  return (
    <div className="asst-page">
      <PageHeading title={t('nav.assistant')} variant="plain">
        <p className="lead mb-6">{t('assistant.lead')}</p>
      </PageHeading>

      <ol className="asst-log" aria-live="polite" data-testid="assistant-log">
        {turns.map((turn) => (
          <li key={turn.id} className="flex flex-col gap-4">
            <p className="asst-you">
              <span className="visually-hidden">{t('assistant.you')}: </span>
              {turn.question}
            </p>
            <div className="card asst-bot" data-testid="assistant-answer">
              <div className="asst-langs" role="group" aria-label={t('assistant.answerLang')}>
                {LOCALES.map((l) => (
                  <button key={l} type="button" className="asst-lang" aria-pressed={turn.lang === l} onClick={() => switchLang(turn, l)}>
                    <span aria-hidden="true">{LANG_SHORT[l]}</span><span className="sr-only">{t(`assistant.langName.${l}`)}</span>
                  </button>
                ))}
              </div>
              <AnswerIn lang={turn.lang}>
                <span className="visually-hidden">{t('assistant.bot')}: </span>
                {turn.state === 'loading' ? <p>{t('common.loading')}</p> : null}
                {turn.state === 'error' ? <p role="alert">{turn.tooMany ? t('assistant.tooMany') : t('common.loadError')}</p> : null}
                {turn.state === 'ready' ? <Answer answer={turn.answer} /> : null}
              </AnswerIn>
            </div>
          </li>
        ))}
      </ol>

      <form
        className="mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="assistant-q" className="label">{t('assistant.question')}</label>
        <div className="field-row">
          <input id="assistant-q" type="text" className="field" maxLength={300} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn" disabled={!draft.trim()}>
            <Send aria-hidden="true" className="size-5" />
            {t('assistant.ask')}
          </button>
        </div>
      </form>

      <section aria-labelledby="assistant-examples" className="mb-6">
        <h2 id="assistant-examples" className="h3 mb-4">{t('assistant.examplesTitle')}</h2>
        <ul className="flex flex-wrap gap-2.5">
          {EXAMPLES.map((key) => (
            <li key={key}>
              <button type="button" className="btn line text-left" onClick={() => ask(t(`assistant.examples.${key}`))}>{t(`assistant.examples.${key}`)}</button>
            </li>
          ))}
        </ul>
      </section>
      {turns.length > 0 ? (
        <button type="button" className="btn ghost sm mb-10" onClick={() => setTurns([])}>{t('assistant.restart')}</button>
      ) : null}
      <p className="muted mt-6">
        {t('assistant.notFound')} <Link to={`/${lang}/faq`} className="font-bold">{t('assistant.notFoundFaq')}</Link>
        {phone ? <>{` ${t('assistant.notFoundCall')} `}<a href={telHref(phone)} className="font-bold">{phone}</a></> : null}.
      </p>
    </div>
  );
}
