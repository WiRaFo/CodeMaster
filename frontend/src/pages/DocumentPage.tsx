import { Copy, Share2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useAnnounce } from '../app/Announcer.tsx';
import { DocumentViewer } from '../components/document/DocumentViewer.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate, formatYears } from '../lib/format.ts';
import type { DocumentCard, DocumentPageItem, OpenDocumentCard } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/**
 * Карточка документа (ТЗ §5.3; F-040 – F-045). Что показать, решает сервер: для ограниченного доступа
 * API не отдаёт ни копии, ни расшифровки, и страница даже не запрашивает список страниц.
 */
export function DocumentPage() {
  const { t } = useTranslation();
  const { lang = 'kk', id = '' } = useParams();
  const card = useApi<DocumentCard>(`/catalog/documents/${encodeURIComponent(id)}?lang=${lang}`);

  if (card.status === 'error' && card.notFound) return <NotFoundPage />;
  if (card.status !== 'ready') return <LoadStatus status={card.status === 'error' ? 'error' : 'loading'} />;
  const d = card.data;
  const catalogLink = (param: string, value: string) => `/${lang}/catalog?${new URLSearchParams({ [param]: value }).toString()}`;

  return (
    <article>
      <nav aria-label={t('document.breadcrumbs')} className="mb-4 text-sm">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li>
            <Link to={`/${lang}/catalog`}>{t('nav.catalog')}</Link>
          </li>
          {[
            { label: t('document.fond'), level: d.hierarchy.fond },
            { label: t('document.inventory'), level: d.hierarchy.inventory },
            { label: t('document.case'), level: d.hierarchy.case },
          ].map(({ label, level }) => (
            <li key={level.id} className="flex items-center gap-2">
              <span aria-hidden="true">/</span>
              <span>
                {label} {level.number}
                {level.title ? <span className="text-muted">: {level.title}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <PageHeading title={d.title ?? d.archiveCode.formatted}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <OriginBadge origin={d.dataOrigin} />
          {d.access === 'restricted' ? <span className="badge-warning">{t('catalog.restricted')}</span> : null}
          <TranslationNote contentLang={d.contentLang} translationStatus={d.translationStatus} />
        </div>
      </PageHeading>

      <CodeActions code={d.archiveCode.formatted} title={d.title ?? d.archiveCode.formatted} />

      {d.dataOrigin === 'synthetic' || d.dataOrigin === 'demo' ? (
        // Пометка на языке интерфейса; sourceNote из базы пишется на одном языке и не переводится.
        <p className="mb-6 max-w-3xl rounded border border-demo-text bg-demo-bg p-3 text-demo-text" data-testid="origin-note">
          {t(`document.originNote.${d.dataOrigin}`)}
        </p>
      ) : d.sourceNote ? (
        <p className="mb-6 max-w-3xl text-sm text-muted">{d.sourceNote}</p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          {d.description ? (
            <section aria-labelledby="doc-description" className="mb-6 max-w-[75ch]">
              <h2 id="doc-description" className="mb-2 text-2xl font-bold">{t('document.description')}</h2>
              <p>{d.description}</p>
              {d.historicalNote ? <p className="mt-3">{d.historicalNote}</p> : null}
            </section>
          ) : null}

          {d.access === 'restricted' ? (
            <section aria-labelledby="doc-access" className="mb-6 max-w-[75ch] rounded border-2 border-warning-text bg-warning-bg p-4 text-warning-text" data-testid="restricted-notice">
              <h2 id="doc-access" className="mb-2 text-2xl font-bold">{t('document.restrictedTitle')}</h2>
              {d.accessConditions ? <p className="mb-2">{d.accessConditions}</p> : null}
              <p className="mb-2">{t('document.restrictedNoCopy')}</p>
              <Link to={`/${lang}/visitors`} className="font-semibold text-warning-text">{t('document.readingRoomLink')}</Link>
            </section>
          ) : (
            <OpenContent card={d} lang={lang} />
          )}
        </div>

        <aside aria-labelledby="doc-meta">
          <h2 id="doc-meta" className="mb-3 text-2xl font-bold">{t('document.metadata')}</h2>
          <dl className="document-meta">
            <Meta label={t('document.archiveCode')}>{d.archiveCode.formatted}</Meta>
            <Meta label={t('document.number')}>{d.documentNumber}</Meta>
            <Meta label={t('document.date')}>{formatYears(d.date)}</Meta>
            <Meta label={t('document.period')}>{d.period?.name}</Meta>
            <Meta label={t('document.type')}>{d.type.name}</Meta>
            <Meta label={t('document.originalLanguages')}>
              {d.originalLanguages.length ? d.originalLanguages.map((l) => t(`document.language.${l}`, { defaultValue: l })).join(', ') : null}
            </Meta>
            <Meta label={t('document.sheets')}>{d.sheetCount}</Meta>
            <Meta label={t('document.author')}>{d.author}</Meta>
            <Meta label={t('document.organization')}>{d.organization?.name}</Meta>
            <Meta label={t('document.branch')}>{d.storage.branch.name}</Meta>
            <Meta label={t('document.location')}>{d.storage.location}</Meta>
            <Meta label={t('document.settlements')}>
              {d.settlements.length ? <LinkList items={d.settlements.map((s) => ({ key: s.slug, to: catalogLink('settlement', s.slug), label: s.name ?? s.slug }))} /> : null}
            </Meta>
            <Meta label={t('document.topics')}>
              {d.topics.length ? <LinkList items={d.topics.map((s) => ({ key: s.slug, to: catalogLink('topic', s.slug), label: s.name ?? s.slug }))} /> : null}
            </Meta>
            <Meta label={t('document.access')}>{t(`catalog.accessValue.${d.access}`)}</Meta>
            <Meta label={t('document.updated')}>{formatDate(d.updatedAt, lang)}</Meta>
          </dl>
        </aside>
      </div>
    </article>
  );
}

/** Цифровая копия и расшифровка открытого документа. */
function OpenContent({ card, lang }: { card: OpenDocumentCard; lang: string }) {
  const { t } = useTranslation();
  const pages = useApi<{ items: DocumentPageItem[] }>(card.digitalCopy.availableOnline ? `/catalog/documents/${card.id}/pages?lang=${lang}` : null);
  return (
    <>
      <section aria-labelledby="doc-copy" className="mb-6">
        <h2 id="doc-copy" className="mb-2 text-2xl font-bold">{t('document.digitalCopy')}</h2>
        {!card.digitalCopy.availableOnline ? (
          <p>{t('document.noCopy')}</p>
        ) : pages.status === 'ready' && pages.data.items.length > 0 ? (
          <DocumentViewer documentId={card.id} pages={pages.data.items} />
        ) : pages.status === 'ready' ? (
          <p>{t('document.noCopy')}</p>
        ) : (
          <LoadStatus status={pages.status === 'error' ? 'error' : 'loading'} />
        )}
      </section>
      {card.transcription ? (
        <section aria-labelledby="doc-transcription" className="mb-6 max-w-[75ch]">
          <h2 id="doc-transcription" className="mb-2 text-2xl font-bold">{t('document.transcription')}</h2>
          <p className="whitespace-pre-line" {...(card.contentLang ? { lang: card.contentLang } : {})}>{card.transcription}</p>
        </section>
      ) : null}
    </>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function LinkList({ items }: { items: Array<{ key: string; to: string; label: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((i) => (
        <li key={i.key}>
          <Link to={i.to}>{i.label}</Link>
        </li>
      ))}
    </ul>
  );
}

/** Шифр крупно, «Скопировать шифр» (F-044) и «Поделиться» (F-045). Результат объявляется диктору. */
function CodeActions({ code, title }: { code: string; title: string }) {
  const { t } = useTranslation();
  const announce = useAnnounce();
  // Видимое подтверждение; диктору то же сообщение передаёт общий announcer.
  const [notice, setNotice] = useState('');
  const say = (text: string) => {
    setNotice(text);
    announce(text);
  };

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say(done);
    } catch {
      say(t('document.copyFailed'));
    }
  };

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // Пользователь закрыл окно «Поделиться» — ничего не делаем.
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copy(url, t('document.linkCopied'));
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <p className="text-xl font-semibold" data-testid="archive-code">{code}</p>
      <button type="button" className="btn-secondary" onClick={() => void copy(code, t('document.codeCopied', { code }))}>
        <Copy aria-hidden="true" className="size-5" />
        <span>{t('document.copyCode')}</span>
      </button>
      <button type="button" className="btn-secondary" onClick={() => void share()}>
        <Share2 aria-hidden="true" className="size-5" />
        <span>{t('document.share')}</span>
      </button>
      {notice ? <p className="text-sm font-semibold" data-testid="copy-notice">{notice}</p> : null}
    </div>
  );
}
