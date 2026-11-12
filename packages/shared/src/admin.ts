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
