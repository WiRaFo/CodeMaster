import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { OriginBadge } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { ApiRequestError, apiGet } from '../lib/api.ts';
import { SECTIONS, sectionHref } from '../lib/sections.ts';
import type { AssistantAnswer, AssistantRecognized, AssistantSection } from '../lib/types.ts';
import { VerificationBadge, telHref } from './BranchesPage.tsx';

type Turn = { id: number; question: string } & ({ state: 'loading' } | { state: 'error'; tooMany: boolean } | { state: 'ready'; answer: AssistantAnswer });

const EXAMPLES = ['photos', 'service', 'term', 'branch'] as const;

function SectionLinks({ links }: { links: AssistantSection[] }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {links.map((key) => {
        const path = SECTIONS.find((s) => s.key === key)?.path ?? key;
        return (
          <li key={key}>
            <Link to={sectionHref(lang, path)} className="btn-secondary">{t(`nav.${key}`)}</Link>
          </li>
        );
      })}
    </ul>
  );
}

function RecognizedList({ items }: { items: AssistantRecognized[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div className="mb-2">
      <p>{t('assistant.understood')}</p>
      <ul className="mt-1 flex flex-wrap gap-2" data-testid="recognized">
        {items.map((r) => (
          <li key={`${r.kind}-${r.text}`} className="rounded border-2 border-border bg-surface-2 px-2 py-0.5">
            <span className="text-muted">{t(`assistant.kinds.${r.kind}`)}: </span>
            {r.kind === 'years' ? (r.yearFrom === r.yearTo ? String(r.yearFrom) : `${r.yearFrom}–${r.yearTo}`) : r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Answer({ answer }: { answer: AssistantAnswer }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  switch (answer.intent) {
    case 'service_request':
      return (<><p>{t('assistant.answers.service')}</p><SectionLinks links={answer.links} /></>);
    case 'navigation':
      return (<><p>{t('assistant.answers.navigation')}</p><SectionLinks links={answer.links} /></>);
    case 'unknown':
      return (<><p>{t('assistant.answers.unknown')}</p><SectionLinks links={answer.links} /></>);
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
              <li key={b.slug} className="rounded-md border-2 border-border p-3">
                <Link to={`/${lang}/branches/${b.slug}`} className="font-semibold">{b.name ?? b.slug}</Link>{' '}
                <VerificationBadge show={b.needsVerification} />
                {b.address ? <p>{b.address}</p> : null}
                {b.phone ? <p><a href={telHref(b.phone)}>{b.phone}</a></p> : null}
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
              <ol className="mt-2 flex flex-col gap-2" aria-label={t('assistant.sources')}>
                {answer.documents.map((d) => (
                  <li key={d.id} className="rounded-md border-2 border-border p-3">
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
              <p className="mt-2"><Link to={catalog(answer.catalogQuery)} className="font-semibold">{t('assistant.answers.allResults')}</Link></p>
              {answer.suggestions.length > 0 ? (
                <>
                  <p className="mt-3">{t('assistant.answers.suggestions')}</p>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {answer.suggestions.map((s) => (
                      <li key={s.reason}><Link to={catalog(s.query)} className="btn-secondary">{t(`assistant.suggest.${s.reason}`)}</Link></li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </>
      );
    }
  }
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

  const ask = (question: string) => {
    const q = question.trim().slice(0, 300);
    if (!q) return;
    const id = ++counter.current;
    setTurns((list) => [...list, { id, question: q, state: 'loading' }]);
    setDraft('');
    apiGet<AssistantAnswer>(`/assistant/ask?${new URLSearchParams({ q, lang }).toString()}`)
      .then((answer) => setTurns((list) => list.map((x) => (x.id === id ? { id, question: q, state: 'ready', answer } : x))))
      .catch((error: unknown) => {
        const tooMany = error instanceof ApiRequestError && error.status === 429;
        setTurns((list) => list.map((x) => (x.id === id ? { id, question: q, state: 'error', tooMany } : x)));
      });
  };

  useEffect(() => {
    const q = params.get('q');
    if (q && asked.current !== q) {
      asked.current = q;
      ask(q);
    }
    // ask зависит только от языка; повторный запрос — только при новом q в адресе.
  }, [params]);

  return (
    <>
      <PageHeading title={t('nav.assistant')}>
        <p className="mt-2 max-w-3xl">{t('assistant.lead')}</p>
      </PageHeading>
      <p className="mb-6 max-w-3xl rounded-md border-2 border-border bg-surface p-3 text-sm">{t('assistant.disclaimer')}</p>

      <ol className="mb-6 flex max-w-3xl flex-col gap-4" aria-live="polite" data-testid="assistant-log">
        {turns.map((turn) => (
          <li key={turn.id} className="flex flex-col gap-2">
            <p className="self-end rounded-md bg-surface-2 px-3 py-2">
              <span className="visually-hidden">{t('assistant.you')}: </span>
              {turn.question}
            </p>
            <div className="rounded-md border-2 border-border bg-surface p-3" data-testid="assistant-answer">
              <span className="visually-hidden">{t('assistant.bot')}: </span>
              {turn.state === 'loading' ? <p>{t('common.loading')}</p> : null}
              {turn.state === 'error' ? <p role="alert">{turn.tooMany ? t('assistant.tooMany') : t('common.loadError')}</p> : null}
              {turn.state === 'ready' ? <Answer answer={turn.answer} /> : null}
            </div>
          </li>
        ))}
      </ol>

      <form
        className="mb-4 flex max-w-3xl flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(draft);
        }}
      >
        <label htmlFor="assistant-q" className="font-semibold">{t('assistant.question')}</label>
        <div className="flex flex-wrap gap-2">
          <input id="assistant-q" type="text" className="input min-w-0 flex-1" maxLength={300} value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
          <button type="submit" className="btn-primary" disabled={!draft.trim()}>
            <Send aria-hidden="true" className="size-5" />
            {t('assistant.ask')}
          </button>
        </div>
      </form>

      <section aria-labelledby="assistant-examples" className="max-w-3xl">
        <h2 id="assistant-examples" className="mb-2 font-semibold">{t('assistant.examplesTitle')}</h2>
        <ul className="flex flex-wrap gap-2">
          {EXAMPLES.map((key) => (
            <li key={key}>
              <button type="button" className="btn-secondary text-left" onClick={() => ask(t(`assistant.examples.${key}`))}>{t(`assistant.examples.${key}`)}</button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
