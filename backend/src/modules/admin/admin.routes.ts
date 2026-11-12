import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, PublicationStatus } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  LOCALES,
  adminListSchema,
  applyWorkflowAction,
  availableWorkflowActions,
  caseInputSchema,
  documentCompletenessIssues,
  documentInputSchema,
  fondInputSchema,
  formatArchiveCode,
  inventoryInputSchema,
  workflowBodySchema,
  type DocumentInput,
  type Locale,
  type WorkflowAction,
} from '@archive-vko/shared';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { pageOf } from '../../http/pagination.ts';
import { registerStaffGuard, requirePermission, staffOf, type Staff } from '../../http/staff.ts';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import { hasGrant } from '../auth/session.ts';
import { writeAudit } from '../audit/audit.ts';
import { branchAdminRoutes } from './branches-admin.ts';
import { contentAdminRoutes } from './content-admin.ts';
import { exhibitionAdminRoutes } from './exhibitions-admin.ts';
import { exportAdminRoutes } from './export-admin.ts';
import { importAdminRoutes } from './import-admin.ts';
import { memoryAdminRoutes } from './memory-admin.ts';
import { publicationsAdminRoutes } from './publications-admin.ts';
import { newsAdminRoutes } from './news-admin.ts';
import { overviewAdminRoutes } from './overview-admin.ts';
import { userAdminRoutes } from './users-admin.ts';
import { CATALOG_READ, MASTER_BUCKET, STATUS_RU, UPLOAD_LIMIT, UPLOAD_TYPES, actionFromPath, catalogBranchScope, notifyWorkflow, ruFirst, sniffImage } from './admin-common.ts';
import {
  branchOf,
  compactDate,
  documentData,
  isCatalogEntity,
  labelOf,
  saveTranslations,
  setStatus,
  statusOf,
  type CatalogEntity,
} from './catalog-admin.ts';

const uuidParam = z.object({ id: z.uuid() });

export interface AdminOptions {
  db: PrismaClient;
  storage: ObjectStorage;
  allowedOrigins: readonly string[];
}

/**
 * Административный API каталога (docs/api-design.md §5; ТЗ §6.3, §6.7, §6.8).
 * Каждый маршрут проверяет право на сервере; изменения и запись журнала — в одной транзакции.
 */
export async function adminRoutes(app: FastifyInstance, { db, storage, allowedOrigins }: AdminOptions): Promise<void> {
  app.decorateRequest('staff', null);
  registerStaffGuard(app, db, allowedOrigins);

  /** Без branchId — есть ли право каталога хоть где-то (общие списки фильтруются по филиалам отдельно). */
  const canReadCatalog = (staff: Staff, branchId?: string | null) =>
    CATALOG_READ.some((p) => (branchId === undefined ? hasGrant(staff.grants, p) || staff.grants.byBranch.has(p) : hasGrant(staff.grants, p, branchId)));
  const requireCatalogRead = (request: FastifyRequest, branchId?: string | null) => {
    const staff = staffOf(request);
    if (!canReadCatalog(staff, branchId)) throw new ApiError(403, 'FORBIDDEN', 'Catalog permission required');
    return staff;
  };

  /** Справочники для форм. */
  app.get('/admin/reference', async (request) => {
    requireCatalogRead(request);
    const [types, branches] = await Promise.all([
      db.documentType.findMany({ orderBy: { sortOrder: 'asc' }, select: { code: true, translations: { where: { locale: 'ru' }, select: { name: true } } } }),
      db.branch.findMany({ where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, translations: { where: { locale: 'ru' }, select: { shortName: true, fullName: true } } } }),
    ]);
    return {
      documentTypes: types.map((t) => ({ code: t.code, name: t.translations[0]?.name ?? t.code })),
      branches: branches.map((b) => ({ id: b.id, slug: b.slug, name: b.translations[0]?.shortName ?? b.translations[0]?.fullName ?? b.slug })),
    };
  });

  /** Дерево фонд → опись → дело для выбора места документа (простые формы, ЭТАП 10a). */
  app.get('/admin/catalog/tree', async (request) => {
    const staff = requireCatalogRead(request);
    const fonds = await db.fond.findMany({
      where: { deletedAt: null },
      orderBy: [{ fondNumberSort: 'asc' }, { fondNumber: 'asc' }],
      select: {
        id: true,
        branchId: true,
        fondNumber: true,
        publicationStatus: true,
        accessLevel: true,
        translations: { where: { locale: 'ru' }, select: { title: true } },
        inventories: {
          where: { deletedAt: null },
          orderBy: { inventoryNumber: 'asc' },
          select: {
            id: true,
            inventoryNumber: true,
            publicationStatus: true,
            accessLevel: true,
            translations: { where: { locale: 'ru' }, select: { title: true } },
            cases: {
              where: { deletedAt: null },
              orderBy: { caseNumber: 'asc' },
              select: { id: true, caseNumber: true, publicationStatus: true, accessLevel: true, translations: { where: { locale: 'ru' }, select: { title: true } } },
            },
          },
        },
      },
    });
    return {
      fonds: fonds
        .filter((f) => canReadCatalog(staff, f.branchId))
        .map((f) => ({
          id: f.id,
          number: f.fondNumber,
          title: f.translations[0]?.title ?? null,
          status: f.publicationStatus,
          access: f.accessLevel,
          inventories: f.inventories.map((i) => ({
            id: i.id,
            number: i.inventoryNumber,
            title: i.translations[0]?.title ?? null,
            status: i.publicationStatus,
            access: i.accessLevel,
            cases: i.cases.map((c) => ({ id: c.id, number: c.caseNumber, title: c.translations[0]?.title ?? null, status: c.publicationStatus, access: c.accessLevel })),
          })),
        })),
    };
  });

  app.get('/admin/documents', async (request) => {
    const staff = requireCatalogRead(request);
    const query = adminListSchema.parse(request.query);
    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      ...(query.status ? { publicationStatus: query.status } : {}),
      ...(query.q ? { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } } : {}),
    };
    // Администратор филиала видит только документы своих филиалов.
    const branchIds = catalogBranchScope(staff);
    if (branchIds) where.case = { inventory: { fond: { branchId: { in: branchIds } } } };
    const [total, rows] = await Promise.all([
      db.document.count({ where }),
      db.document.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          documentNumber: true,
          publicationStatus: true,
          accessLevel: true,
          dataOrigin: true,
          updatedAt: true,
          translations: { select: { locale: true, title: true } },
          case: { select: { caseNumber: true, inventory: { select: { inventoryNumber: true, fond: { select: { fondNumber: true } } } } } },
        },
      }),
    ]);
    return pageOf(
      rows.map((d) => ({
        id: d.id,
        title: ruFirst(d.translations)?.title ?? null,
        archiveCode: formatArchiveCode({ fond: d.case.inventory.fond.fondNumber, inventory: d.case.inventory.inventoryNumber, case: d.case.caseNumber }, 'ru'),
        documentNumber: d.documentNumber,
        status: d.publicationStatus,
        access: d.accessLevel,
        dataOrigin: d.dataOrigin,
        updatedAt: d.updatedAt.toISOString(),
      })),
      total,
      query.page,
      query.pageSize,
    );
  });

  app.get('/admin/documents/:id', async (request) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const { id } = uuidParam.parse(request.params);
    const branchId = await branchOf(db, 'documents', id);
    if (!branchId) throw notFound();
    const staff = requireCatalogRead(request, branchId);
    const d = await db.document.findUnique({
      where: { id },
      include: {
        translations: true,
        documentType: { select: { code: true } },
        case: { select: { id: true, caseNumber: true, inventory: { select: { inventoryNumber: true, fond: { select: { fondNumber: true } } } } } },
        assets: { select: { assetId: true, pageNumber: true, asset: { select: { mimeType: true, processingStatus: true, antivirusStatus: true, originalFilename: true } } }, orderBy: { pageNumber: 'asc' } },
      },
    });
    if (!d || d.deletedAt) throw notFound();
    const translations: Partial<Record<Locale, unknown>> = {};
    for (const t of d.translations) {
      translations[t.locale] = {
        title: t.title,
        description: t.description,
        historicalNote: t.historicalNote,
        accessConditions: t.accessConditions,
        transcription: t.transcription,
        translationStatus: t.translationStatus,
      };
    }
    const history = await db.auditLog.findMany({
      where: { entityType: 'documents', entityId: id },
      orderBy: { occurredAt: 'desc' },
      take: 50,
      select: { occurredAt: true, action: true, summary: true, changes: true, userId: true },
    });
    const users = await db.user.findMany({ where: { id: { in: history.map((h) => h.userId).filter((x): x is string => x !== null) } }, select: { id: true, fullName: true } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      id: d.id,
      status: d.publicationStatus,
      archiveCode: formatArchiveCode({ fond: d.case.inventory.fond.fondNumber, inventory: d.case.inventory.inventoryNumber, case: d.case.caseNumber }, 'ru'),
      updatedAt: d.updatedAt.toISOString(),
      hasDigitalCopy: d.hasDigitalCopy,
      input: {
        caseId: d.caseId,
        documentNumber: d.documentNumber,
        documentTypeCode: d.documentType.code,
        dateFrom: compactDate(d.dateFrom, d.datePrecision),
        dateTo: compactDate(d.dateTo, d.datePrecision),
        sheetsFrom: d.sheetsFrom,
        sheetsTo: d.sheetsTo,
        sheetCount: d.sheetCount,
        originalLanguages: d.originalLanguages,
        authorText: d.authorText,
        storageLocation: d.storageLocation,
        accessLevel: d.accessLevel,
        dataOrigin: d.dataOrigin,
        sourceNote: d.sourceNote,
        translations,
      },
      pages: d.assets.map((a) => ({
        assetId: a.assetId,
        pageNumber: a.pageNumber,
        mimeType: a.asset.mimeType,
        processingStatus: a.asset.processingStatus,
        antivirusStatus: a.asset.antivirusStatus,
        filename: a.asset.originalFilename,
      })),
      actions: allowedActions(staff, d.publicationStatus, branchId),
      canEdit: canEdit(staff, d.publicationStatus, branchId),
      canDelete: hasGrant(staff.grants, 'catalog:delete', branchId),
      history: history.map((h) => ({ at: h.occurredAt.toISOString(), action: h.action, summary: h.summary, changes: h.changes, user: h.userId ? (names.get(h.userId) ?? null) : null })),
    };
  });

  app.post('/admin/documents', async (request, reply) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const input = documentInputSchema.parse(request.body);
    const branchId = await branchOf(db, 'cases', input.caseId);
    if (!branchId) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown case', [{ path: ['caseId'], code: 'unknown' }]);
    const staff = requirePermission(request, 'catalog:edit', branchId);
    requireTitle(input);
    requireOpenConfirmation(input, null);
    const data = await documentData(db, input);
    const id = await db.$transaction(async (tx) => {
      const doc = await tx.document.create({ data: { ...data, publicationStatus: 'draft', createdById: staff.session.userId, updatedById: staff.session.userId } });
      await saveTranslations(tx, doc.id, input, staff.session.userId);
      await writeAudit(tx, request, {
        userId: staff.session.userId,
        action: 'create',
        entityType: 'documents',
        entityId: doc.id,
        summary: `Создан черновик документа «${await labelOf(tx, 'documents', doc.id)}»`,
      });
      return doc.id;
    });
    return reply.status(201).send({ id });
  });

  app.patch('/admin/documents/:id', async (request) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const { id } = uuidParam.parse(request.params);
    const input = documentInputSchema.parse(request.body);
    const branchId = await branchOf(db, 'documents', id);
    if (!branchId) throw notFound();
    const current = await statusOf(db, 'documents', id);
    const staff = staffOf(request);
    if (!canEdit(staff, current.status, branchId)) throw new ApiError(403, 'FORBIDDEN', 'Editing in this status requires catalog:publish');
    // Перенос в другое дело — тоже правка: нужно право и в филиале нового дела.
    if (input.caseId) {
      const targetBranch = await branchOf(db, 'cases', input.caseId);
      if (!targetBranch) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown case', [{ path: ['caseId'], code: 'unknown' }]);
      if (!hasGrant(staff.grants, 'catalog:edit', targetBranch)) throw new ApiError(403, 'FORBIDDEN', 'Permission catalog:edit required');
    }
    // Защита от перезаписи чужой правки: If-Match с updatedAt, который видела форма.
    assertIfMatch(request, current.updatedAt);
    requireTitle(input);
    requireOpenConfirmation(input, current.accessLevel);
    // Опубликованная карточка не может стать неполной.
    if (current.status !== 'draft' && current.status !== 'needs_changes') requireComplete(input);
    const data = await documentData(db, input);
    await db.$transaction(async (tx) => {
      const before = await tx.document.findUniqueOrThrow({ where: { id }, include: { translations: true } });
      await tx.document.update({ where: { id }, data: { ...data, updatedById: staff.session.userId } });
      await saveTranslations(tx, id, input, staff.session.userId);
      const label = await labelOf(tx, 'documents', id);
      await writeAudit(tx, request, {
        userId: staff.session.userId,
        action: 'update',
        entityType: 'documents',
        entityId: id,
        summary: `Изменён документ «${label}»`,
        changes: changedFields(before, data, input),
      });
      if (before.accessLevel !== input.accessLevel) {
        await writeAudit(tx, request, {
          userId: staff.session.userId,
          action: 'access_change',
          entityType: 'documents',
          entityId: id,
          summary: `Уровень доступа «${label}»: ${before.accessLevel} → ${input.accessLevel}`,
          changes: { from: before.accessLevel, to: input.accessLevel },
        });
      }
    });
    return { id, updatedAt: (await statusOf(db, 'documents', id)).updatedAt.toISOString() };
  });

  // Тело загрузки — сам файл (без multipart): тип проверяется по сигнатуре ниже.
  app.addContentTypeParser([...UPLOAD_TYPES, 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: UPLOAD_LIMIT }, (_request, body, done) => done(null, body));

  /**
   * Загрузка скана страницы (ТЗ §6.3; F-144). Файл сохраняется в закрытый бакет мастер-копий.
   * Пока антивирус не подключён (ClamAV — ЭТАП 13), файл остаётся в статусе «ожидает проверки»
   * и на сайте не показывается: публичное представление пропускает только проверенные файлы.
   */
  app.post('/admin/documents/:id/pages', async (request, reply) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const { id } = uuidParam.parse(request.params);
    const branchId = await branchOf(db, 'documents', id);
    if (!branchId) throw notFound();
    const staff = requirePermission(request, 'assets:upload', branchId);
    const current = await statusOf(db, 'documents', id);
    if (!canEdit(staff, current.status, branchId)) throw new ApiError(403, 'FORBIDDEN', 'Editing in this status requires catalog:publish');
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new ApiError(400, 'VALIDATION_FAILED', 'File is required', [{ path: ['file'], code: 'required' }]);
    const mime = sniffImage(data);
    if (!mime) throw new ApiError(415, 'VALIDATION_FAILED', 'Only JPEG, PNG and WebP images are accepted', [{ path: ['file'], code: 'unsupported_type' }]);
    const rawName = request.headers['x-filename'];
    const filename = (typeof rawName === 'string' ? decodeURIComponent(rawName) : 'scan').replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 200) || 'scan';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    const key = `documents/${id}/${randomUUID()}.${ext}`;
    await storage.write(MASTER_BUCKET, key, data);
    const doc = await db.document.findUniqueOrThrow({ where: { id }, select: { accessLevel: true, dataOrigin: true } });
    const result = await db.$transaction(async (tx) => {
      const last = await tx.documentAsset.aggregate({ where: { documentId: id }, _max: { pageNumber: true } });
      const pageNumber = (last._max.pageNumber ?? 0) + 1;
      const asset = await tx.digitalAsset.create({
        data: {
          kind: 'scan_page',
          storageBucket: MASTER_BUCKET,
          storageKey: key,
          originalFilename: filename,
          mimeType: mime,
          sizeBytes: BigInt(data.length),
          sha256: createHash('sha256').update(data).digest('hex'),
          accessLevel: doc.accessLevel,
          dataOrigin: doc.dataOrigin,
          processingStatus: 'ready',
          antivirusStatus: 'pending',
          createdById: staff.session.userId,
        },
      });
      await tx.documentAsset.create({ data: { documentId: id, assetId: asset.id, pageNumber } });
      await writeAudit(tx, request, {
        userId: staff.session.userId,
        action: 'upload',
        entityType: 'documents',
        entityId: id,
        summary: `Загружена страница ${pageNumber} («${filename}», ${mime}) к «${await labelOf(tx, 'documents', id)}»`,
        changes: { assetId: asset.id, pageNumber, sizeBytes: data.length },
      });
      return { assetId: asset.id, pageNumber };
    });
    return reply.status(201).send({ ...result, mimeType: mime, antivirusStatus: 'pending' });
  });

  app.delete('/admin/documents/:id', async (request, reply) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const { id } = uuidParam.parse(request.params);
    const body = workflowBodySchema.parse(request.body ?? {});
    const branchId = await branchOf(db, 'documents', id);
    if (!branchId) throw notFound();
    const staff = requirePermission(request, 'catalog:delete', branchId);
    if (!body.confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    await db.$transaction(async (tx) => {
      const label = await labelOf(tx, 'documents', id);
      await tx.document.update({ where: { id }, data: { deletedAt: new Date(), updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'documents', entityId: id, summary: `Удалён документ «${label}»` });
    });
    return reply.status(204).send();
  });

  /** Фонд, опись, дело: простые формы создания (ЭТАП 10a). Создаются черновиками. */
  app.post('/admin/fonds', async (request, reply) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const input = fondInputSchema.parse(request.body);
    const branch = await db.branch.findFirst({ where: { slug: input.branchSlug, deletedAt: null }, select: { id: true } });
    if (!branch) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown branch', [{ path: ['branchSlug'], code: 'unknown' }]);
    const staff = requirePermission(request, 'catalog:edit', branch.id);
    requireOpenHierarchy(input);
    const id = await createHierarchy(request, staff, 'fonds', input.title, async (tx) => {
      const sortable = Number.parseInt(input.number.replace(/\D+/g, ''), 10);
      const fond = await tx.fond.create({
        data: {
          branchId: branch.id,
          fondNumber: input.number,
          fondNumberSort: Number.isFinite(sortable) ? sortable : null,
          yearFrom: input.yearFrom,
          yearTo: input.yearTo,
          accessLevel: input.accessLevel,
          dataOrigin: input.dataOrigin,
          createdById: staff.session.userId,
          translations: { create: { locale: 'ru', title: input.title, translationStatus: 'reviewed' } },
        },
      });
      return fond.id;
    });
    return reply.status(201).send({ id });
  });

  app.post('/admin/inventories', async (request, reply) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const input = inventoryInputSchema.parse(request.body);
    const branchId = await branchOf(db, 'fonds', input.fondId);
    if (!branchId) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown fond', [{ path: ['fondId'], code: 'unknown' }]);
    const staff = requirePermission(request, 'catalog:edit', branchId);
    requireOpenHierarchy(input);
    const id = await createHierarchy(request, staff, 'inventories', input.title, async (tx) =>
      (
        await tx.inventory.create({
          data: {
            fondId: input.fondId,
            inventoryNumber: input.number,
            yearFrom: input.yearFrom,
            yearTo: input.yearTo,
            accessLevel: input.accessLevel,
            dataOrigin: input.dataOrigin,
            createdById: staff.session.userId,
            translations: { create: { locale: 'ru', title: input.title, translationStatus: 'reviewed' } },
          },
        })
      ).id,
    );
    return reply.status(201).send({ id });
  });

  app.post('/admin/cases', async (request, reply) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const input = caseInputSchema.parse(request.body);
    const branchId = await branchOf(db, 'inventories', input.inventoryId);
    if (!branchId) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown inventory', [{ path: ['inventoryId'], code: 'unknown' }]);
    const staff = requirePermission(request, 'catalog:edit', branchId);
    requireOpenHierarchy(input);
    const id = await createHierarchy(request, staff, 'cases', input.title, async (tx) =>
      (
        await tx.case.create({
          data: {
            inventoryId: input.inventoryId,
            caseNumber: input.number,
            dateFrom: input.yearFrom ? new Date(Date.UTC(input.yearFrom, 0, 1)) : null,
            dateTo: input.yearTo ? new Date(Date.UTC(input.yearTo, 11, 31)) : null,
            accessLevel: input.accessLevel,
            dataOrigin: input.dataOrigin,
            createdById: staff.session.userId,
            translations: { create: { locale: 'ru', title: input.title, translationStatus: 'reviewed' } },
          },
        })
      ).id,
    );
    return reply.status(201).send({ id });
  });

  /**
   * Согласование (ТЗ §6.7, с. 15; F-150, F-151): допустимость перехода и право проверяет сервер.
   * POST /admin/{documents|fonds|inventories|cases}/:id/{submit|request-changes|approve|publish|archive|restore}
   */
  app.post('/admin/:entity/:id/:action', async (request) => {
    requireCatalogRead(request); // до разбора данных и поиска записи: без прав каталога — сразу 403
    const params = z.object({ entity: z.string().max(20), id: z.uuid(), action: z.string().max(20) }).parse(request.params);
    const action = actionFromPath(params.action);
    if (!isCatalogEntity(params.entity) || !action) throw notFound();
    const entity: CatalogEntity = params.entity;
    const body = workflowBodySchema.parse(request.body ?? {});
    const branchId = await branchOf(db, entity, params.id);
    if (!branchId) throw notFound();
    const current = await statusOf(db, entity, params.id);
    const result = applyWorkflowAction(current.status, action);
    if (!result.ok) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot ${action} from ${current.status}`);
    const staff = requirePermission(request, `catalog:${result.permission}`, branchId);
    if (action === 'request_changes' && !body.comment) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Comment is required', [{ path: ['comment'], code: 'required' }]);
    }
    if (action === 'archive' && !body.confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Unpublishing must be confirmed');
    if (entity === 'documents' && (action === 'submit' || action === 'approve' || action === 'publish')) {
      await assertDocumentComplete(db, params.id);
    }

    await db.$transaction(async (tx) => {
      await setStatus(tx, entity, params.id, result.to, staff.session.userId);
      const label = await labelOf(tx, entity, params.id);
      const summary = `«${label}»: ${STATUS_RU[current.status]} → ${STATUS_RU[result.to]}${body.comment ? `. Комментарий: ${body.comment}` : ''}`;
      await writeAudit(tx, request, {
        userId: staff.session.userId,
        action: 'status_change',
        entityType: entity,
        entityId: params.id,
        summary,
        changes: { from: current.status, to: result.to, ...(body.comment ? { comment: body.comment } : {}) },
      });
      await notifyWorkflow(tx, 'catalog', { entity, id: params.id, action, to: result.to, label, comment: body.comment ?? null, actorId: staff.session.userId, authorId: current.createdById });
    });
    return { id: params.id, status: result.to };
  });

  await exhibitionAdminRoutes(app, { db, storage });
  await branchAdminRoutes(app, { db });
  await importAdminRoutes(app, { db });
  await contentAdminRoutes(app, { db });
  await userAdminRoutes(app, { db });
  await newsAdminRoutes(app, { db });
  await memoryAdminRoutes(app, { db });
  await publicationsAdminRoutes(app, { db });
  await exportAdminRoutes(app, { db });
  await overviewAdminRoutes(app, { db });

  // ——— вспомогательные функции, которым нужен db ———

  async function createHierarchy(
    request: FastifyRequest,
    staff: Staff,
    entity: 'fonds' | 'inventories' | 'cases',
    title: string,
    create: (tx: Prisma.TransactionClient) => Promise<string>,
  ): Promise<string> {
    try {
      return await db.$transaction(async (tx) => {
        const id = await create(tx);
        const kind = { fonds: 'фонд', inventories: 'опись', cases: 'дело' }[entity];
        await writeAudit(tx, request, { userId: staff.session.userId, action: 'create', entityType: entity, entityId: id, summary: `Создан черновик: ${kind} «${title}»` });
        return id;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ApiError(409, 'CONFLICT', 'A record with this number already exists', [{ path: ['number'], code: 'duplicate' }]);
      }
      throw error;
    }
  }

  async function assertDocumentComplete(tx: PrismaClient | Prisma.TransactionClient, id: string): Promise<void> {
    const d = await tx.document.findUniqueOrThrow({ where: { id }, include: { translations: true } });
    const translations: Partial<Record<Locale, { title: string | null; description: string | null; accessConditions: string | null }>> = {};
    for (const t of d.translations) translations[t.locale] = t;
    const issues = documentCompletenessIssues({
      dateFrom: d.dateFrom ? d.dateFrom.toISOString() : null,
      accessLevel: d.accessLevel,
      dataOrigin: d.dataOrigin,
      sourceNote: d.sourceNote,
      translations,
    });
    if (issues.length) throw new ApiError(422, 'INCOMPLETE_RECORD', 'Required fields are missing', issues);
  }
}

/** Черновик и запись на доработке правит сотрудник с правом edit; остальное — только с правом publish. */
function canEdit(staff: Staff, status: string, branchId: string): boolean {
  if (status === 'draft' || status === 'needs_changes') return hasGrant(staff.grants, 'catalog:edit', branchId);
  return hasGrant(staff.grants, 'catalog:publish', branchId);
}

function allowedActions(staff: Staff, status: PublicationStatus, branchId: string): WorkflowAction[] {
  return availableWorkflowActions(status).filter((a) => {
    const r = applyWorkflowAction(status, a);
    return r.ok && hasGrant(staff.grants, `catalog:${r.permission}`, branchId);
  });
}

function requireTitle(input: DocumentInput): void {
  if (!LOCALES.some((l) => input.translations[l]?.title)) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Title is required', [{ path: ['translations', 'ru', 'title'], code: 'required' }]);
  }
}

function requireComplete(input: DocumentInput): void {
  const issues = documentCompletenessIssues({
    dateFrom: input.dateFrom,
    accessLevel: input.accessLevel,
    dataOrigin: input.dataOrigin,
    sourceNote: input.sourceNote,
    translations: Object.fromEntries(
      LOCALES.map((l) => [l, { title: input.translations[l]?.title ?? null, description: input.translations[l]?.description ?? null, accessConditions: input.translations[l]?.accessConditions ?? null }]),
    ),
  });
  if (issues.length) throw new ApiError(422, 'INCOMPLETE_RECORD', 'Required fields are missing', issues);
}

/** Открыть доступ — действие с последствиями (публикация копии): только с явным подтверждением. */
function requireOpenConfirmation(input: DocumentInput, previous: string | null): void {
  if (input.accessLevel === 'open' && previous !== 'open' && !input.confirmOpenAccess) {
    throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Opening access must be confirmed', [{ path: ['confirmOpenAccess'], code: 'required' }]);
  }
}

function requireOpenHierarchy(input: { accessLevel: string; confirmOpenAccess?: boolean | undefined }): void {
  if (input.accessLevel === 'open' && input.confirmOpenAccess !== true) {
    throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Opening access must be confirmed', [{ path: ['confirmOpenAccess'], code: 'required' }]);
  }
}

/** Список изменённых полей для журнала (без длинных текстов целиком). */
function changedFields(
  before: { accessLevel: string; caseId: string; documentNumber: string | null; translations: Array<{ locale: string; title: string; description: string | null; transcription: string | null }> },
  after: { accessLevel: string; caseId: string; documentNumber: string | null },
  input: DocumentInput,
): Prisma.InputJsonValue {
  const fields: string[] = [];
  if (before.accessLevel !== after.accessLevel) fields.push('accessLevel');
  if (before.caseId !== after.caseId) fields.push('caseId');
  if (before.documentNumber !== after.documentNumber) fields.push('documentNumber');
  for (const l of LOCALES) {
    const b = before.translations.find((t) => t.locale === l);
    const a = input.translations[l];
    if ((b?.title ?? null) !== (a?.title ?? null)) fields.push(`${l}.title`);
    if ((b?.description ?? null) !== (a?.description ?? null)) fields.push(`${l}.description`);
    if ((b?.transcription ?? null) !== (a?.transcription ?? null)) fields.push(`${l}.transcription`);
  }
  return { fields };
}
