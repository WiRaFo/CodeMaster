import { z } from 'zod';
import { LOCALES, type Locale } from './enums.ts';

/**
 * Схемы административного API (docs/api-design.md §4, §5). Общие для backend и формы админки,
 * чтобы проверка обязательных полей совпадала (F-146).
 */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Дата: «1956», «1956-03» или «1956-03-14». Неполная дата хранится как начало и конец периода. */
export const partialDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, 'invalid_date')
  .nullish()
  .transform((v) => (v ? v : null));

export const documentTranslationInputSchema = z.object({
  title: optionalText(500),
  description: optionalText(5000),
  historicalNote: optionalText(5000),
  accessConditions: optionalText(2000),
  transcription: optionalText(50_000),
});
export type DocumentTranslationInput = z.infer<typeof documentTranslationInputSchema>;

/** Сотрудник вводит реальные сведения (verified, нужен источник) или демонстрационные (demo). */
export const STAFF_DATA_ORIGINS = ['verified', 'demo'] as const;

export const documentInputSchema = z.object({
  caseId: z.uuid(),
  documentNumber: optionalText(30),
  documentTypeCode: z.string().trim().min(1).max(60),
  dateFrom: partialDateSchema,
  dateTo: partialDateSchema,
  sheetsFrom: optionalText(20),
  sheetsTo: optionalText(20),
  sheetCount: z.coerce.number().int().min(0).max(100_000).nullish().transform((v) => v ?? null),
  originalLanguages: z.array(z.string().trim().regex(/^[a-z]{2,3}$/)).max(10).default([]),
  authorText: optionalText(500),
  storageLocation: optionalText(200),
  accessLevel: z.enum(['open', 'restricted', 'closed']),
  dataOrigin: z.enum(STAFF_DATA_ORIGINS),
  sourceNote: optionalText(1000),
  translations: z.partialRecord(z.enum(LOCALES), documentTranslationInputSchema),
  /** Открытие доступа требует явного подтверждения (F-154; api-design §5). */
  confirmOpenAccess: z.boolean().optional(),
});
export type DocumentInput = z.infer<typeof documentInputSchema>;

export interface ValidationIssue {
  path: string[];
  code: string;
}

/**
 * Проверка перед отправкой на проверку (F-146): неполная карточка не уходит дальше черновика.
 * Возвращает список незаполненных полей; пустой список — карточку можно отправлять.
 */
export function documentCompletenessIssues(doc: {
  dateFrom: string | null;
  accessLevel: string;
  dataOrigin: string;
  sourceNote: string | null;
  translations: Partial<Record<Locale, { title: string | null; description: string | null; accessConditions: string | null }>>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filled = LOCALES.filter((l) => doc.translations[l]?.title);
  if (filled.length === 0) issues.push({ path: ['translations', 'ru', 'title'], code: 'required' });
  for (const l of filled) {
    const t = doc.translations[l];
    if (!t?.description) issues.push({ path: ['translations', l, 'description'], code: 'required' });
    if (doc.accessLevel === 'restricted' && !t?.accessConditions) issues.push({ path: ['translations', l, 'accessConditions'], code: 'required' });
  }
  if (!doc.dateFrom) issues.push({ path: ['dateFrom'], code: 'required' });
  if (doc.dataOrigin === 'verified' && !doc.sourceNote) issues.push({ path: ['sourceNote'], code: 'required' });
  return issues;
}

export const hierarchyInputSchema = z.object({
  number: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(500),
  yearFrom: z.coerce.number().int().min(1000).max(2100).nullish().transform((v) => v ?? null),
  yearTo: z.coerce.number().int().min(1000).max(2100).nullish().transform((v) => v ?? null),
  accessLevel: z.enum(['open', 'restricted', 'closed']),
  dataOrigin: z.enum(STAFF_DATA_ORIGINS),
  confirmOpenAccess: z.boolean().optional(),
});
export const fondInputSchema = hierarchyInputSchema.extend({ branchSlug: z.string().trim().min(1).max(60) });
export const inventoryInputSchema = hierarchyInputSchema.extend({ fondId: z.uuid() });
export const caseInputSchema = hierarchyInputSchema.extend({ inventoryId: z.uuid() });

export const workflowBodySchema = z.object({
  /** Обязателен для «вернуть на доработку» (api-design §5). */
  comment: z.string().trim().max(2000).optional(),
  /** Опасные действия (снятие с публикации) требуют подтверждения. */
  confirm: z.boolean().optional(),
});

export const adminListSchema = z.object({
  status: z.enum(['draft', 'in_review', 'needs_changes', 'approved', 'published', 'archived']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** ЭТАП 8. Выставки в панели управления (ТЗ §6.5, с. 14–15; F-148). */
export const exhibitionTranslationInputSchema = z.object({
  title: optionalText(300),
  lead: optionalText(1000),
  description: optionalText(10_000),
});

export const exhibitionInputSchema = z
  .object({
    slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid_slug'),
    yearFrom: z.coerce.number().int().min(1000).max(2100).nullish().transform((v) => v ?? null),
    yearTo: z.coerce.number().int().min(1000).max(2100).nullish().transform((v) => v ?? null),
    isFeatured: z.boolean().default(false),
    dataOrigin: z.enum(STAFF_DATA_ORIGINS),
    topics: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    translations: z.partialRecord(z.enum(LOCALES), exhibitionTranslationInputSchema),
  })
  .refine((v) => v.yearFrom === null || v.yearTo === null || v.yearFrom <= v.yearTo, { path: ['yearTo'], message: 'year_order' });
export type ExhibitionInput = z.infer<typeof exhibitionInputSchema>;

export const exhibitionItemTranslationInputSchema = z.object({
  title: optionalText(300),
  description: optionalText(5000),
  sourceNote: optionalText(1000),
  altText: optionalText(500),
});

export const exhibitionItemInputSchema = z.object({
  documentId: z.uuid().nullish().transform((v) => v ?? null),
  translations: z.partialRecord(z.enum(LOCALES), exhibitionItemTranslationInputSchema),
});
export type ExhibitionItemInput = z.infer<typeof exhibitionItemInputSchema>;

/**
 * Готовность выставки к проверке и публикации: название, описание, хотя бы один экспонат;
 * у каждого экспоната название и источник, у экспоната с изображением — текстовая альтернатива (A-004).
 */
export function exhibitionCompletenessIssues(ex: {
  translations: Partial<Record<Locale, { title: string | null; description: string | null }>>;
  items: Array<{ hasImage: boolean; translations: Partial<Record<Locale, { title: string | null; sourceNote: string | null; altText: string | null }>> }>;
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const locales = LOCALES.filter((l) => ex.translations[l]?.title);
  if (!locales.length) issues.push({ path: ['translations', 'ru', 'title'], code: 'required' });
  for (const l of locales) if (!ex.translations[l]?.description) issues.push({ path: ['translations', l, 'description'], code: 'required' });
  if (!ex.items.length) issues.push({ path: ['items'], code: 'required' });
  ex.items.forEach((item, index) => {
    const itemLocales = LOCALES.filter((l) => item.translations[l]?.title);
    if (!itemLocales.length) issues.push({ path: ['items', String(index), 'title'], code: 'required' });
    for (const l of itemLocales) {
      if (!item.translations[l]?.sourceNote) issues.push({ path: ['items', String(index), l, 'sourceNote'], code: 'required' });
      if (item.hasImage && !item.translations[l]?.altText) issues.push({ path: ['items', String(index), l, 'altText'], code: 'required' });
    }
  });
  return issues;
}

/** Темы вопросов и ответов (дополнение к ТЗ §2: группировка FAQ с управлением из панели). Порядок — порядок на сайте. */
export const FAQ_TOPICS = ['services', 'catalog', 'access', 'visit', 'site'] as const;
export type FaqTopic = (typeof FAQ_TOPICS)[number];

export const faqInputSchema = z.object({
  topic: z.enum(FAQ_TOPICS),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  published: z.boolean(),
  dataOrigin: z.enum(STAFF_DATA_ORIGINS),
  translations: z.partialRecord(z.enum(LOCALES), z.object({ question: z.string().trim().min(5).max(500), answer: z.string().trim().min(5).max(5000) })),
}).refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru', 'question'], message: 'required' });
export type FaqInput = z.infer<typeof faqInputSchema>;

/** Рубрики новостей (справочник categories.kind = news_rubric). */
export const NEWS_RUBRICS = ['news', 'announcements', 'events'] as const;

/**
 * Новость в панели (ТЗ §5.11, F-100). Текст — обычные абзацы через пустую строку, без HTML.
 * Адрес (slug) задаётся латиницей; дата публикации необязательна: при публикации ставится текущая.
 */
export const newsInputSchema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(120),
  rubric: z.enum(NEWS_RUBRICS),
  branchSlug: z.string().trim().min(1).max(60).nullish().transform((v) => v ?? null),
  dataOrigin: z.enum(STAFF_DATA_ORIGINS),
  sourceUrl: z.string().trim().max(500).transform((v) => (v === '' ? null : v)).nullish()
    .refine((v) => v == null || /^https:\/\/[^\s]+$/.test(v), { message: 'https' }).transform((v) => v ?? null),
  translations: z.partialRecord(z.enum(LOCALES), z.object({
    title: z.string().trim().min(5).max(300),
    lead: z.string().trim().max(1000).transform((v) => (v === '' ? null : v)).nullish().transform((v) => v ?? null),
    bodyText: z.string().trim().min(10).max(20_000),
  })),
}).refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru', 'title'], message: 'required' });
export type NewsInput = z.infer<typeof newsInputSchema>;

/* «Архив памяти» в панели (ТЗ §5.6, §6.6; F-149). Источник обязателен: событие и сведения о человеке без источника не публикуются. */
const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(120);
const optionalLongText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullish().transform((v) => v ?? null);
const optionalYear = z.union([z.literal(''), z.null(), z.coerce.number().int().min(1000).max(2100)]).optional().transform((v) => (typeof v === 'number' ? v : null));

export const timelineEventInputSchema = z.object({
  slug: slugSchema,
  year: z.coerce.number().int().min(1000).max(2100),
  /** Точная дата, если известна; год даты должен совпасть с годом события. */
  date: z.union([z.literal(''), z.null(), z.iso.date()]).optional().transform((v) => (v ? v : null)),
  published: z.boolean(),
  dataOrigin: z.enum(STAFF_DATA_ORIGINS),
  sourceNote: z.string().trim().min(5).max(500),
  translations: z.partialRecord(z.enum(LOCALES), z.object({
    title: z.string().trim().min(3).max(300),
    description: optionalLongText(10_000),
  })),
})
  .refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru', 'title'], message: 'required' })
  .refine((v) => v.date === null || v.date.startsWith(String(v.year)), { path: ['date'], message: 'year mismatch' });
export type TimelineEventInput = z.infer<typeof timelineEventInputSchema>;

export const personInputSchema = z.object({
  slug: slugSchema,
  birthYear: optionalYear,
  deathYear: optionalYear,
  published: z.boolean(),
  dataOrigin: z.enum(STAFF_DATA_ORIGINS),
  sourceNote: z.string().trim().min(5).max(500),
  translations: z.partialRecord(z.enum(LOCALES), z.object({
    fullName: z.string().trim().min(3).max(200),
    biography: optionalLongText(20_000),
  })),
})
  .refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru', 'fullName'], message: 'required' })
  .refine((v) => v.birthYear === null || v.deathYear === null || v.birthYear <= v.deathYear, { path: ['deathYear'], message: 'order' });
export type PersonInput = z.infer<typeof personInputSchema>;

export const COLLECTION_ITEM_TYPES = ['document', 'person'] as const;
export const collectionInputSchema = z.object({
  slug: slugSchema,
  published: z.boolean(),
  featured: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10_000),
  dataOrigin: z.enum(STAFF_DATA_ORIGINS),
  translations: z.partialRecord(z.enum(LOCALES), z.object({
    title: z.string().trim().min(3).max(300),
    description: optionalLongText(2000),
  })),
  items: z.array(z.object({ type: z.enum(COLLECTION_ITEM_TYPES), id: z.uuid() })).max(200),
})
  .refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru', 'title'], message: 'required' })
  .refine((v) => new Set(v.items.map((i) => `${i.type}:${i.id}`)).size === v.items.length, { path: ['items'], message: 'duplicate' });
export type CollectionInput = z.infer<typeof collectionInputSchema>;
