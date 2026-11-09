import { formatArchiveCode, type Locale } from '@archive-vko/shared';
import { toSafeHighlight } from '../../http/highlight.ts';
import type { DocumentRow } from './catalog.repository.ts';

const isoDate = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export function sheetsLabel(from: string | null, to: string | null): string | undefined {
  if (!from) return undefined;
  return to && to !== from ? `${from}–${to}` : from;
}

export function archiveCodeDto(
  row: { fond_number: string; inventory_number?: string; case_number?: string; sheets_from?: string | null; sheets_to?: string | null },
  lang: Locale,
) {
  const code = {
    fond: row.fond_number,
    inventory: row.inventory_number,
    case: row.case_number,
    sheets: sheetsLabel(row.sheets_from ?? null, row.sheets_to ?? null),
  };
  return { ...code, formatted: formatArchiveCode(code, lang) };
}

export const dateDto = (row: { date_from: Date | null; date_to: Date | null; date_precision: string }) => ({
  from: isoDate(row.date_from),
  to: isoDate(row.date_to),
  precision: row.date_precision,
});

/** Элемент выдачи каталога. Одинаковый набор полей для open и restricted: в нём нет закрытых сведений. */
export function documentSummaryDto(row: DocumentRow, lang: Locale) {
  return {
    id: row.id,
    title: row.title,
    contentLang: row.content_lang,
    translationStatus: row.translation_status,
    archiveCode: archiveCodeDto(row, lang),
    documentNumber: row.document_number,
    date: dateDto(row),
    type: { code: row.type_code, name: row.type_name },
    branch: { slug: row.branch_slug, name: row.branch_name },
    access: row.effective_access,
    /** Копию можно смотреть на сайте: документ эффективно открыт, есть проверенные страницы. */
    hasDigitalCopy: row.effective_access === 'open' && row.online_copy,
    dataOrigin: row.data_origin,
    highlight: toSafeHighlight(row.highlight),
  };
}
