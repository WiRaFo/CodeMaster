import { Prisma } from '@prisma/client';
import type { Locale } from '@archive-vko/shared';

/**
 * Таблицы переводов, из которых выбирается лучший язык. Имена — константы кода,
 * пользовательский ввод в Prisma.raw не попадает.
 */
const TRANSLATION_TABLES = {
  document: ['document_translations', 'document_id'],
  fond: ['fond_translations', 'fond_id'],
  inventory: ['inventory_translations', 'inventory_id'],
  case: ['case_translations', 'case_id'],
  documentType: ['document_type_translations', 'document_type_id'],
  period: ['historical_period_translations', 'period_id'],
  branch: ['branch_translations', 'branch_id'],
  branchType: ['branch_type_translations', 'branch_type_id'],
  settlement: ['settlement_translations', 'settlement_id'],
  category: ['category_translations', 'category_id'],
  organization: ['organization_translations', 'organization_id'],
} as const;
export type TranslationTable = keyof typeof TRANSLATION_TABLES;

/**
 * LEFT JOIN LATERAL с переводом на запрошенном языке; если его нет — русский, затем любой.
 * Переводы со статусом missing не используются. Колонки перечисляются явно.
 */
export function bestTranslation(
  table: TranslationTable,
  alias: string,
  idExpr: string,
  lang: Locale,
  columns: readonly string[],
): Prisma.Sql {
  const [tableName, fk] = TRANSLATION_TABLES[table];
  const cols = columns.map((c) => `t.${c}`).join(', ');
  return Prisma.sql`LEFT JOIN LATERAL (
    SELECT t.locale::text AS locale, t.translation_status::text AS translation_status, ${Prisma.raw(cols)}
    FROM ${Prisma.raw(tableName)} t
    WHERE t.${Prisma.raw(fk)} = ${Prisma.raw(idExpr)} AND t.translation_status <> 'missing'
    ORDER BY (t.locale = ${lang}::"Locale") DESC, (t.locale = 'ru') DESC, t.locale
    LIMIT 1
  ) ${Prisma.raw(alias)} ON true`;
}

export const and = (conditions: Prisma.Sql[]): Prisma.Sql =>
  conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

/** Экранирование для ILIKE … ESCAPE '\'. */
export const likePattern = (value: string): string => `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
