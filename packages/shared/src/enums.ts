/**
 * Общие перечисления домена. Значения совпадают с enum-ами PostgreSQL (backend/prisma/schema.prisma).
 * Источник требований: docs/database-design.md §2.
 */

export const LOCALES = ['kk', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
/** Язык по умолчанию, если браузер не сообщил поддерживаемый (Q-07). */
export const DEFAULT_LOCALE: Locale = 'kk';

/** Статусы согласования публикаций, ТЗ §6.7, с. 15. */
export const PUBLICATION_STATUSES = [
  'draft',
  'in_review',
  'needs_changes',
  'approved',
  'published',
  'archived',
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/**
 * Уровни доступа, ТЗ §5.3, с. 6 (Q-05):
 * open — метаданные и цифровая копия; restricted — только карточка и условия доступа; closed — не публикуется.
 */
export const ACCESS_LEVELS = ['open', 'restricted', 'closed'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/** Происхождение записи (Б§23, ТЗ §11). */
export const DATA_ORIGINS = ['verified', 'migrated', 'demo', 'synthetic'] as const;
export type DataOrigin = (typeof DATA_ORIGINS)[number];

export const TRANSLATION_STATUSES = ['missing', 'machine', 'reviewed'] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

export const DATE_PRECISIONS = ['day', 'month', 'year', 'decade'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/** Строже = больше индекс. Эффективный доступ — самый строгий уровень в цепочке фонд → опись → дело → документ. */
const ACCESS_RANK: Record<AccessLevel, number> = { open: 0, restricted: 1, closed: 2 };

export function strictestAccess(levels: readonly AccessLevel[]): AccessLevel {
  let result: AccessLevel = 'open';
  for (const level of levels) {
    if (ACCESS_RANK[level] > ACCESS_RANK[result]) result = level;
  }
  return result;
}

/** Темы отзывов о сайте (ЭТАП 7). */
export const FEEDBACK_TOPICS = ['site', 'catalog', 'accessibility', 'content', 'suggestion', 'other'] as const;
export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number];
