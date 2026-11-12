import type { AccessLevel, Prisma, PrismaClient, PublicationStatus } from '@prisma/client';
import { LOCALES, formatArchiveCode, type DocumentInput, type Locale } from '@archive-vko/shared';
import { ApiError, notFound } from '../../http/errors.ts';
import { ruFirst } from './admin-common.ts';

/** Сущности каталога, у которых есть статус согласования. Ресурс прав для всех — `catalog`. */
export const CATALOG_ENTITIES = ['documents', 'fonds', 'inventories', 'cases'] as const;
export type CatalogEntity = (typeof CATALOG_ENTITIES)[number];
export const isCatalogEntity = (v: string): v is CatalogEntity => CATALOG_ENTITIES.some((e) => e === v);

/** Филиал записи — для прав администратора филиала (F-141). */
export async function branchOf(db: PrismaClient | Prisma.TransactionClient, entity: CatalogEntity, id: string): Promise<string | null> {
  const rows = await (() => {
    switch (entity) {
      case 'fonds':
        return db.$queryRaw<Array<{ branch_id: string }>>`SELECT branch_id FROM fonds WHERE id = ${id}::uuid AND deleted_at IS NULL`;
      case 'inventories':
        return db.$queryRaw<Array<{ branch_id: string }>>`
          SELECT f.branch_id FROM inventories i JOIN fonds f ON f.id = i.fond_id WHERE i.id = ${id}::uuid AND i.deleted_at IS NULL`;
      case 'cases':
        return db.$queryRaw<Array<{ branch_id: string }>>`
          SELECT f.branch_id FROM cases c JOIN inventories i ON i.id = c.inventory_id JOIN fonds f ON f.id = i.fond_id
          WHERE c.id = ${id}::uuid AND c.deleted_at IS NULL`;
      case 'documents':
        return db.$queryRaw<Array<{ branch_id: string }>>`
          SELECT f.branch_id FROM documents d JOIN cases c ON c.id = d.case_id JOIN inventories i ON i.id = c.inventory_id
          JOIN fonds f ON f.id = i.fond_id WHERE d.id = ${id}::uuid AND d.deleted_at IS NULL`;
    }
  })();
  return rows[0]?.branch_id ?? null;
}

/** Статус и автор записи любой сущности каталога; удалённая запись — 404. */
export async function statusOf(
  db: PrismaClient | Prisma.TransactionClient,
  entity: CatalogEntity,
  id: string,
): Promise<{ status: PublicationStatus; createdById: string | null; accessLevel: AccessLevel; updatedAt: Date }> {
  const select = { publicationStatus: true, createdById: true, accessLevel: true, updatedAt: true, deletedAt: true } as const;
  const row = await (() => {
    switch (entity) {
      case 'documents':
        return db.document.findUnique({ where: { id }, select });
      case 'fonds':
        return db.fond.findUnique({ where: { id }, select });
      case 'inventories':
        return db.inventory.findUnique({ where: { id }, select });
      case 'cases':
        return db.case.findUnique({ where: { id }, select });
    }
  })();
  if (!row || row.deletedAt) throw notFound();
  return { status: row.publicationStatus, createdById: row.createdById, accessLevel: row.accessLevel, updatedAt: row.updatedAt };
}

export async function setStatus(
  db: Prisma.TransactionClient,
  entity: CatalogEntity,
  id: string,
  status: PublicationStatus,
  userId: string,
): Promise<void> {
  const data = { publicationStatus: status, updatedById: userId };
  switch (entity) {
    case 'documents':
      await db.document.update({ where: { id }, data });
      return;
    case 'fonds':
      await db.fond.update({ where: { id }, data });
      return;
    case 'inventories':
      await db.inventory.update({ where: { id }, data });
      return;
    case 'cases':
      await db.case.update({ where: { id }, data });
      return;
  }
}

/** Название записи для уведомлений и журнала: русское, иначе первое заполненное. */
export async function labelOf(db: PrismaClient | Prisma.TransactionClient, entity: CatalogEntity, id: string): Promise<string> {
  const pick = (list: Array<{ locale: Locale; title: string }>) =>
    ruFirst(list)?.title ?? id;
  switch (entity) {
    case 'documents': {
      const d = await db.document.findUnique({
        where: { id },
        select: { translations: { select: { locale: true, title: true } }, case: { select: { caseNumber: true, inventory: { select: { inventoryNumber: true, fond: { select: { fondNumber: true } } } } } } },
      });
      if (!d) return id;
      const code = formatArchiveCode({ fond: d.case.inventory.fond.fondNumber, inventory: d.case.inventory.inventoryNumber, case: d.case.caseNumber }, 'ru');
      return `${pick(d.translations)} (${code})`;
    }
    case 'fonds':
      return pick((await db.fondTranslation.findMany({ where: { fondId: id }, select: { locale: true, title: true } })));
    case 'inventories':
      return pick((await db.inventoryTranslation.findMany({ where: { inventoryId: id }, select: { locale: true, title: true } })));
    case 'cases':
      return pick((await db.caseTranslation.findMany({ where: { caseId: id }, select: { locale: true, title: true } })));
  }
}

/** «1956» → 1956-01-01…1956-12-31 (год); «1956-03» → месяц; «1956-03-14» → день. */
export function expandDate(value: string | null, end: boolean): { date: Date | null; precision: 'day' | 'month' | 'year' } {
  if (!value) return { date: null, precision: 'year' };
  const [y, m, d] = value.split('-').map(Number) as [number, number | undefined, number | undefined];
  if (m === undefined) return { date: new Date(Date.UTC(y, end ? 11 : 0, end ? 31 : 1)), precision: 'year' };
  if (m < 1 || m > 12) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid date', [{ path: ['date'], code: 'invalid_date' }]);
  if (d === undefined) return { date: new Date(Date.UTC(y, end ? m : m - 1, end ? 0 : 1)), precision: 'month' };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid date', [{ path: ['date'], code: 'invalid_date' }]);
  return { date, precision: 'day' };
}

/** Обратное преобразование для формы: дата в той точности, в какой её ввели. */
export function compactDate(date: Date | null, precision: string): string | null {
  if (!date) return null;
  const iso = date.toISOString().slice(0, 10);
  if (precision === 'year' || precision === 'decade') return iso.slice(0, 4);
  if (precision === 'month') return iso.slice(0, 7);
  return iso;
}

/** Поля документа для записи в базу из формы. */
export async function documentData(db: PrismaClient | Prisma.TransactionClient, input: DocumentInput) {
  const type = await db.documentType.findUnique({ where: { code: input.documentTypeCode }, select: { id: true } });
  if (!type) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown document type', [{ path: ['documentTypeCode'], code: 'unknown' }]);
  const from = expandDate(input.dateFrom, false);
  const to = expandDate(input.dateTo ?? input.dateFrom, true);
  const year = from.date?.getUTCFullYear() ?? null;
  const period =
    year === null
      ? null
      : await db.historicalPeriod.findFirst({
          where: { AND: [{ OR: [{ yearFrom: null }, { yearFrom: { lte: year } }] }, { OR: [{ yearTo: null }, { yearTo: { gte: year } }] }] },
          orderBy: { sortOrder: 'asc' },
          select: { id: true },
        });
  return {
    caseId: input.caseId,
    documentNumber: input.documentNumber,
    documentTypeId: type.id,
    dateFrom: from.date,
    dateTo: to.date,
    datePrecision: from.precision,
    periodId: period?.id ?? null,
    sheetsFrom: input.sheetsFrom,
    sheetsTo: input.sheetsTo,
    sheetCount: input.sheetCount,
    originalLanguages: input.originalLanguages,
    authorText: input.authorText,
    storageLocation: input.storageLocation,
    accessLevel: input.accessLevel,
    dataOrigin: input.dataOrigin,
    sourceNote: input.sourceNote,
  };
}

/** Переводы: заполненный язык сохраняется, язык без названия удаляется. Текст, введённый сотрудником, считается проверенным. */
export async function saveTranslations(tx: Prisma.TransactionClient, documentId: string, input: DocumentInput, userId: string): Promise<void> {
  for (const locale of LOCALES) {
    const t = input.translations[locale];
    if (!t?.title) {
      await tx.documentTranslation.deleteMany({ where: { documentId, locale } });
      continue;
    }
    const data = {
      title: t.title,
      description: t.description,
      historicalNote: t.historicalNote,
      accessConditions: t.accessConditions,
      transcription: t.transcription,
      translationStatus: 'reviewed' as const,
      translatedById: userId,
    };
    await tx.documentTranslation.upsert({ where: { documentId_locale: { documentId, locale } }, create: { documentId, locale, ...data }, update: data });
  }
}
