import { CircleAlert, ExternalLink, FileText } from 'lucide-react';
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
        {p.blocks.map((block, i) => <InfoBlockView key={i} block={block} label={headingBefore(p.blocks, i)} />)}
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

/** Цена без разрыва внутри числа; несколько цен через « / » переносятся только между ними. */
function priceParts(cell: string) {
  return cell.split(' / ').flatMap((part, i) => [
    ...(i > 0 ? [' / '] : []),
    <span key={i} className="whitespace-nowrap">{part}</span>,
  ]);
}

/** Подзаголовок прямо перед блоком: им называется область прокрутки таблицы. */
export function headingBefore(blocks: readonly InfoBlock[], i: number): string | undefined {
  const prev = blocks[i - 1];
  return prev?.type === 'h' ? prev.text : undefined;
}

/**
 * Блок справочного текста. headingLevel — уровень подзаголовков: 3, когда текст стоит внутри раздела с h2.
 * label — название таблицы для области прокрутки (обычно подзаголовок перед ней).
 */
export function InfoBlockView({ block, headingLevel = 2, label }: { block: InfoBlock; headingLevel?: 2 | 3; label?: string | undefined }) {
  const { t } = useTranslation();
  switch (block.type) {
    case 'h': return headingLevel === 3 ? <h3 className="mt-2 text-lg font-semibold">{block.text}</h3> : <h2 className="mt-3 text-xl font-semibold">{block.text}</h2>;
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
    case 'table': {
      // Строка без значения в последнем столбце — заголовок группы (например, «1.1. Разработка номенклатур дел»).
      // На узком экране средние столбцы (третий и далее, кроме последнего) показываются под вторым с подписью
      // столбца, чтобы наименование не сжималось в колонку по слогу. Число не разрывается внутри
      // («67 620,0 / 2704,8» переносится только по « / »). Если таблица всё же шире экрана (текст 200 % на 320 px),
      // прокручивается только она сама (WCAG 1.4.10 допускает это для таблиц данных); область доступна с клавиатуры.
      const last = block.head.length - 1;
      const folded = (c: number) => c >= 2 && c < last;
      return (
        <div role="region" aria-label={label ?? t('reference.table')} tabIndex={0} className="max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm wrap-normal sm:text-base">
            <thead>
              <tr>{block.head.map((h, i) => <th key={i} scope="col" className={`border-b-2 border-border p-2 align-bottom${folded(i) ? ' hidden sm:table-cell' : ''}${i === last ? ' text-right' : ''}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className={row[last] ? undefined : 'bg-surface-2 font-semibold'}>
                  {row.map((cell, c) => {
                    if (c === 0) return <th key={c} scope="row" className="border-b border-border p-2 align-top font-normal whitespace-nowrap">{cell}</th>;
                    if (c === last) return <td key={c} className="border-b border-border p-2 align-top text-right">{priceParts(cell)}</td>;
                    if (folded(c)) return <td key={c} className="hidden border-b border-border p-2 align-top sm:table-cell">{cell}</td>;
                    return (
                      <td key={c} className="border-b border-border p-2 align-top">
                        {cell}
                        {row.map((extra, k) => folded(k) && extra ? <span key={k} className="mt-1 block font-normal sm:hidden">{block.head[k]}: {extra}</span> : null)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'links':
      return (
        <ul className="flex flex-col gap-3">
          {block.items.map((l, i) => l.url.startsWith('/files/') ? (
            <li key={i} className="rounded-md border-2 border-border bg-surface p-3">
              <a href={l.url} type="application/pdf" className="inline-flex flex-wrap items-baseline gap-x-2 font-semibold wrap-anywhere">
                <FileText aria-hidden="true" className="size-4 shrink-0 self-center" />
                <span>{l.label}</span>
              </a>
              {l.note ? <p className="mt-1 text-sm">{l.note}</p> : null}
              <p className="mt-1 text-sm text-muted">{t('reference.pdf')}</p>
            </li>
          ) : (
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
