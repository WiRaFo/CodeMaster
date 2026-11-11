import { Check, Copy, Share2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { useAnnounce } from '../app/Announcer.tsx';
import { DocumentViewer } from '../components/document/DocumentViewer.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
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
      <Breadcrumbs items={[{ label: t('nav.catalog'), to: `/${lang}/catalog` }, { label: d.title ?? d.archiveCode.formatted }]} />

      {/* Вложенные папки: фонд → опись → дело (Document.dc.html) */}
      <nav aria-label={t('document.hierarchyLabel')} className="folder-crumbs">
        <Link className="fcrumb f0" to={`/${lang}/catalog/fonds/${d.hierarchy.fond.id}`}>
          <span className="fcrumb-tab">{t('document.fond')} {d.hierarchy.fond.number}</span>{d.hierarchy.fond.title ?? `${t('document.fond')} ${d.hierarchy.fond.number}`}
        </Link>
        <Link className="fcrumb f1" to={`/${lang}/catalog/inventories/${d.hierarchy.inventory.id}`}>
          <span className="fcrumb-tab">{t('document.inventory')} {d.hierarchy.inventory.number}</span>{d.hierarchy.inventory.title ?? `${t('document.inventory')} ${d.hierarchy.inventory.number}`}
        </Link>
        <Link className="fcrumb f2" to={`/${lang}/catalog/cases/${d.hierarchy.case.id}`}>
          <span className="fcrumb-tab">{t('document.case')} {d.hierarchy.case.number}</span>{d.hierarchy.case.title ?? `${t('document.case')} ${d.hierarchy.case.number}`}
        </Link>
      </nav>

      <PageHeading variant="plain" title={d.title ?? d.archiveCode.formatted}>
        <div className="flex flex-wrap items-center gap-2">
          {d.access === 'restricted'
            ? <span className="chip d">{t('catalog.restricted')}</span>
            : <span className="chip b"><Check aria-hidden="true" className="size-[18px]" />{t('catalog.accessValue.open')}</span>}
          <TranslationNote contentLang={d.contentLang} translationStatus={d.translationStatus} />
        </div>
      </PageHeading>

      <CodeActions code={d.archiveCode.formatted} title={d.title ?? d.archiveCode.formatted} />

      {/* Пометки «демо» и «синтетика» на сайте не выводятся (решение заказчика 11.11.2026). */}
      {d.dataOrigin !== 'synthetic' && d.dataOrigin !== 'demo' && d.sourceNote ? (
        <p className="doc-note">{d.sourceNote}</p>
      ) : null}

      <div className="doc-layout">
        <div className="min-w-0">
          {d.description ? (
            <section aria-labelledby="doc-description" className="doc-sec max-w-[75ch]">
              <h2 id="doc-description" className="cat-h2 mb-2.5">{t('document.description')}</h2>
              <p>{d.description}</p>
              {d.historicalNote ? <p className="mt-3">{d.historicalNote}</p> : null}
            </section>
          ) : null}

          {d.access === 'restricted' ? (
            <section aria-labelledby="doc-access" className="doc-sec doc-restricted" data-testid="restricted-notice">
              <h2 id="doc-access" className="cat-h2 mb-2.5">{t('document.restrictedTitle')}</h2>
              {d.accessConditions ? <p className="mb-2">{d.accessConditions}</p> : null}
              <p className="mb-2">{t('document.restrictedNoCopy')}</p>
              <Link to={`/${lang}/visitors`} className="font-bold">{t('document.readingRoomLink')}</Link>
            </section>
          ) : (
            <OpenContent card={d} lang={lang} />
          )}
        </div>

        <aside aria-labelledby="doc-meta" className="doc-aside">
          <h2 id="doc-meta" className="cat-h2 mb-2">{t('document.metadata')}</h2>
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
          <Link to={`/${lang}/visitors`} className="doc-aside-link">{t('document.readingRoomLink')}</Link>
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
      <section aria-labelledby="doc-copy" className="doc-sec">
        <h2 id="doc-copy" className="cat-h2 mb-3.5">{t('document.digitalCopy')}</h2>
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
        <section aria-labelledby="doc-transcription" className="doc-sec">
          <h2 id="doc-transcription" className="cat-h2 mb-2.5">{t('document.transcription')}</h2>
          <p className="doc-transcript whitespace-pre-line" {...(card.contentLang ? { lang: card.contentLang } : {})}>{card.transcription}</p>
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
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <p className="doc-code mono" data-testid="archive-code">{code}</p>
      <button type="button" className="doc-act" onClick={() => void copy(code, t('document.codeCopied', { code }))}>
        <Copy aria-hidden="true" className="size-5" />
        <span>{t('document.copyCode')}</span>
      </button>
      <button type="button" className="doc-act" onClick={() => void share()}>
        <Share2 aria-hidden="true" className="size-5" />
        <span>{t('document.share')}</span>
      </button>
      {notice ? <p className="text-sm font-semibold" data-testid="copy-notice">{notice}</p> : null}
    </div>
  );
}
