import { z } from 'zod';
import { LOCALES } from './enums.ts';

/**
 * Схемы входных параметров публичного API (docs/api-design.md §1, §3).
 * Общие для backend (валидация) и frontend (состояние поиска в URL).
 */

/** Параметр, который можно повторить в query (`?type=a&type=b`) или передать через запятую. */
const multi = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      const list = Array.isArray(value) ? value : [value];
      return list.flatMap((v) => (typeof v === 'string' ? v.split(',') : [v])).map((v) => (typeof v === 'string' ? v.trim() : v)).filter((v) => v !== '');
    }, z.array(item).max(20))
    .optional();

const shortText = (max: number) => z.string().trim().min(1).max(max);
const year = z.coerce.number().int().min(1000).max(2100);
const booleanFlag = z.enum(['true', 'false']).transform((v) => v === 'true');

export const langSchema = z.enum(LOCALES);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const DOCUMENT_SORTS = ['relevance', 'date_asc', 'date_desc', 'code'] as const;

export const documentFiltersSchema = z
  .object({
    q: shortText(200).optional(),
    fond: shortText(30).optional(),
    inventory: shortText(30).optional(),
    case: shortText(30).optional(),
    /** uuid или slug подразделения. */
    branch: multi(shortText(100)),
    /** slug исторического периода. */
    period: multi(shortText(100)),
    /** Код типа документа (historical_document, photo, …). */
    type: multi(shortText(100)),
    /** slug населённого пункта. */
    settlement: multi(shortText(100)),
    /** slug категории каталога или тематики. */
    topic: multi(shortText(100)),
    organization: multi(z.uuid()),
    author: shortText(200).optional(),
    yearFrom: year.optional(),
    yearTo: year.optional(),
    hasDigitalCopy: booleanFlag.optional(),
    access: multi(z.enum(['open', 'restricted'])),
    lang: langSchema.optional(),
  })
  .refine((v) => v.yearFrom === undefined || v.yearTo === undefined || v.yearFrom <= v.yearTo, {
    path: ['yearTo'],
    message: 'yearTo must be greater than or equal to yearFrom',
  });
export type DocumentFilters = z.infer<typeof documentFiltersSchema>;

export const documentSearchSchema = z
  .object({ sort: z.enum(DOCUMENT_SORTS).default('relevance') })
  .and(paginationSchema)
  .and(documentFiltersSchema);
export type DocumentSearchQuery = z.infer<typeof documentSearchSchema>;

export const langOnlySchema = z.object({ lang: langSchema.optional() });

export const fondListSchema = z
  .object({ branch: multi(shortText(100)), q: shortText(200).optional(), lang: langSchema.optional() })
  .and(paginationSchema);

export const resolveCodeSchema = z.object({ code: shortText(100), lang: langSchema.optional() });

export const branchListSchema = z.object({
  type: multi(shortText(50)),
  settlement: multi(shortText(100)),
  q: shortText(100).optional(),
  lang: langSchema.optional(),
});

/** Лента новостей (ТЗ §5.11, с. 12). На главной показываются последние записи. */
export const newsListSchema = z
  .object({ rubric: shortText(100).optional(), lang: langSchema.optional() })
  .and(paginationSchema.extend({ pageSize: z.coerce.number().int().min(1).max(50).default(10) }));
export type NewsListQuery = z.infer<typeof newsListSchema>;

/** ЭТАП 8. Онлайн-выставки (ТЗ §5.7, с. 9): фильтр по тематике и историческому периоду. */
export const exhibitionListSchema = z
  .object({ topic: shortText(100).optional(), period: shortText(100).optional(), lang: langSchema.optional() })
  .and(paginationSchema.extend({ pageSize: z.coerce.number().int().min(1).max(50).default(12) }));
export type ExhibitionListQuery = z.infer<typeof exhibitionListSchema>;
