import type { DatePrecision, Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors.ts';
import { staffOf } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';
import { CATALOG_READ, STATUS_RU, catalogBranchScope, ruFirst } from './admin-common.ts';
import { IMPORT_FIELDS } from './import-admin.ts';

/**
 * Экспорт каталога в CSV (ТЗ §6.3, с. 14; F-145). Столбцы совпадают с шаблоном импорта, поэтому выгрузку
 * можно поправить в Excel и загрузить обратно; в конце — филиал и статус публикации для сверки.
 * Выгружаются все записи, которые сотрудник видит в панели, включая закрытые: файл служебный.
 * Администратор филиала получает только свой филиал. Каждая выгрузка пишется в журнал.
 */

const ACCESS_RU = { open: 'открытый', restricted: 'ограниченный', closed: 'закрытый' } as const;
const MAX_ROWS = 50_000;

const querySchema = z.object({
  status: z.enum(['draft', 'in_review', 'needs_changes', 'approved', 'published', 'archived']).optional(),
  branch: z.string().trim().min(1).max(60).optional(),
});

/** Дата в точности записи: день, месяц или год — в том виде, который понимает импорт. */
export function exportDate(date: Date | null, precision: DatePrecision): string {
  if (!date) return '';
  const iso = date.toISOString().slice(0, 10);
  return precision === 'day' ? iso : precision === 'month' ? iso.slice(0, 7) : iso.slice(0, 4);
}

/** Ячейка CSV с разделителем «;»: кавычки, если нужны; формулы Excel обезвреживаются апострофом. */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export async function exportAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  app.get('/admin/export/documents.csv', async (request, reply) => {
    const staff = staffOf(request);
    const scope = catalogBranchScope(staff);
    if (scope !== null && scope.length === 0) throw new ApiError(403, 'FORBIDDEN', `One of ${CATALOG_READ.join(', ')} required`);
    const query = querySchema.parse(request.query);

    const fond: Prisma.FondWhereInput = { deletedAt: null };
    if (scope) fond.branchId = { in: scope };
    if (query.branch) fond.branch = { slug: query.branch };
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      ...(query.status ? { publicationStatus: query.status } : {}),
      case: { deletedAt: null, inventory: { deletedAt: null, fond } },
    };
    const total = await db.document.count({ where });
    if (total > MAX_ROWS) throw new ApiError(400, 'VALIDATION_FAILED', `Too many rows (${total}); filter by branch or status`, [{ path: ['branch'], code: 'too_big' }]);

    const rows = await db.document.findMany({
      where,
      orderBy: [{ case: { inventory: { fond: { fondNumberSort: 'asc' } } } }, { case: { inventory: { inventoryNumber: 'asc' } } }, { case: { caseNumber: 'asc' } }, { documentNumber: 'asc' }],
      select: {
        documentNumber: true, dateFrom: true, dateTo: true, datePrecision: true, accessLevel: true, sourceNote: true, publicationStatus: true,
        documentType: { select: { code: true, translations: { where: { locale: 'ru' }, select: { name: true } } } },
        translations: { select: { locale: true, title: true, description: true, accessConditions: true } },
        case: {
          select: {
            caseNumber: true, translations: { select: { locale: true, title: true } },
            inventory: {
              select: {
                inventoryNumber: true, translations: { select: { locale: true, title: true } },
                fond: { select: { fondNumber: true, translations: { select: { locale: true, title: true } }, branch: { select: { slug: true } } } },
              },
            },
          },
        },
      },
    });

    const header = [...IMPORT_FIELDS.map((f) => f.label), 'Филиал', 'Статус публикации'];
    const lines = rows.map((d) => {
      const t = ruFirst(d.translations);
      const inv = d.case.inventory;
      const values: Record<(typeof IMPORT_FIELDS)[number]['key'], string> = {
        fond: inv.fond.fondNumber,
        fondTitle: ruFirst(inv.fond.translations)?.title ?? '',
        inventory: inv.inventoryNumber,
        inventoryTitle: ruFirst(inv.translations)?.title ?? '',
        case: d.case.caseNumber,
        caseTitle: ruFirst(d.case.translations)?.title ?? '',
        documentNumber: d.documentNumber ?? '',
        title: t?.title ?? '',
        description: t?.description ?? '',
        dateFrom: exportDate(d.dateFrom, d.datePrecision),
        dateTo: exportDate(d.dateTo, d.datePrecision),
        type: d.documentType.translations[0]?.name ?? d.documentType.code,
        accessLevel: ACCESS_RU[d.accessLevel],
        accessConditions: t?.accessConditions ?? '',
        sourceNote: d.sourceNote ?? '',
      };
      return [...IMPORT_FIELDS.map((f) => values[f.key]), inv.fond.branch.slug, STATUS_RU[d.publicationStatus] ?? d.publicationStatus].map(csvCell).join(';');
    });

    await writeAudit(db, request, {
      userId: staff.session.userId, action: 'export', entityType: 'document',
      summary: `Выгрузка каталога в CSV: ${rows.length} записей`,
      changes: { rows: rows.length, status: query.status ?? null, branch: query.branch ?? null },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="catalog-${stamp}.csv"`)
      .header('cache-control', 'no-store')
      // BOM: Excel открывает UTF-8 с кириллицей и казахскими буквами без ручного выбора кодировки.
      .send(`﻿${[header.map(csvCell).join(';'), ...lines].join('\r\n')}\r\n`);
  });
}
