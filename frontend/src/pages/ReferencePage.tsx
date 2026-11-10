import { CircleAlert, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate } from '../lib/format.ts';
import type { InfoBlock, InfoPageData } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import { MainContacts } from './InfoPages.tsx';

export type ReferenceKey = 'services' | 'services/paid' | 'legislation' | 'reading-room' | 'symbols' | 'links';

/**
 * Справочные разделы по дополнению к ТЗ от 10.11.2026: государственная и платные услуги, законодательство,
 * читальный зал, государственные символы, полезные ссылки. Только сведения: заявлений, заказов, записи
 * и оплаты на сайте нет; внешние ресурсы помечены явно. Незаполненное архивом показано как «ожидает сведений».
 */
export function ReferencePage({ pageKey }: { pageKey: ReferenceKey }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const page = useApi<InfoPageData>(`/pages/${pageKey}?lang=${lang}`);
  if (page.status === 'error' && page.notFound) return <NotFoundPage />;
  if (page.status !== 'ready') return <LoadStatus status={page.status} />;
  const p = page.data;
  return (
    <>
      <PageHeading title={p.title}>
        {p.lead ? <p className="mt-2 max-w-3xl" lang={p.contentLang}>{p.lead}</p> : null}
      </PageHeading>
      <TranslationNote contentLang={p.contentLang} translationStatus={p.translationStatus} />
      <div className="mt-4 mb-8 flex max-w-[75ch] flex-col gap-3" lang={p.contentLang}>
        {p.blocks.map((block, i) => <InfoBlockView key={i} block={block} />)}
      </div>
      {pageKey === 'reading-room' || pageKey === 'services' ? (
        <section aria-labelledby="ref-contacts" className="mb-8 max-w-3xl">
          <h2 id="ref-contacts" className="mb-3 text-xl font-semibold">{t('reference.contactsTitle')}</h2>
          <MainContacts withReadingRoom={pageKey === 'reading-room'} />
        </section>
      ) : null}
      {pageKey === 'services' ? (
        <p className="mb-4"><Link to={`/${lang}/services/paid`}>{t('reference.paidLink')}</Link></p>
      ) : null}
      <p className="text-sm text-muted">{t('reference.actualized', { date: formatDate(p.actualizedAt, lang) })}</p>
    </>
  );
}

function InfoBlockView({ block }: { block: InfoBlock }) {
  const { t } = useTranslation();
  switch (block.type) {
    case 'h': return <h2 className="mt-3 text-xl font-semibold">{block.text}</h2>;
    case 'p': return <p>{block.text}</p>;
    case 'pending':
      return (
        <p className="flex gap-2 rounded-md border-2 border-border bg-surface-2 p-3">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span><span className="font-semibold">{t('reference.pending')}</span> {block.text}</span>
        </p>
      );
    case 'ol': return <ol className="flex list-decimal flex-col gap-1 pl-6">{block.items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
    case 'ul': return <ul className="flex list-disc flex-col gap-1 pl-6">{block.items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
    case 'links':
      return (
        <ul className="flex flex-col gap-3">
          {block.items.map((l, i) => (
            <li key={i} className="rounded-md border-2 border-border bg-surface p-3">
              <a href={l.url} rel="noopener noreferrer" className="inline-flex flex-wrap items-baseline gap-x-2 font-semibold wrap-anywhere">
                <span>{l.label}</span>
                <ExternalLink aria-hidden="true" className="size-4 shrink-0 self-center" />
                <span className="visually-hidden">{t('reference.external')}</span>
              </a>
              {l.note ? <p className="mt-1 text-sm">{l.note}</p> : null}
              <p className="mt-1 text-sm text-muted">{t('reference.externalHost', { host: new URL(l.url).host })}</p>
            </li>
          ))}
        </ul>
      );
  }
}
