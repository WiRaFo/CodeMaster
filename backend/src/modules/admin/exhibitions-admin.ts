import type { Prisma, PrismaClient, PublicationStatus } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  LOCALES,
  applyWorkflowAction,
  availableWorkflowActions,
  exhibitionCompletenessIssues,
  exhibitionInputSchema,
  exhibitionItemInputSchema,
  workflowBodySchema,
  type ExhibitionInput,
  type ExhibitionItemInput,
  type Locale,
  type WorkflowAction,
} from '@archive-vko/shared';
import { ApiError, notFound } from '../../http/errors.ts';
import { requirePermission, staffOf, type Staff } from '../../http/staff.ts';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import { writeAudit } from '../audit/audit.ts';
import { hasGrant } from '../auth/session.ts';
import { MASTER_BUCKET, STATUS_RU, actionFromPath, notifyWorkflow, sniffImage } from './admin-common.ts';

/**
 * Выставки в панели управления (ТЗ §6.5, с. 14–15; F-093, F-148).
 * Права — ресурс exhibitions (edit, submit, review, publish); правило правки как у каталога:
 * черновик и «на доработке» правит exhibitions:edit, остальные статусы — только exhibitions:publish.
 * Загруженное изображение экспоната не публично до антивирусной проверки (как сканы документов).
 */

const ids = z.object({ id: z.uuid() });
const itemIds = z.object({ id: z.uuid(), itemId: z.uuid() });
const READ = ['exhibitions:edit', 'exhibitions:submit', 'exhibitions:review', 'exhibitions:publish'] as const;

const canRead = (staff: Staff) => READ.some((p) => hasGrant(staff.grants, p));
const canEdit = (staff: Staff, status: PublicationStatus) =>
  hasGrant(staff.grants, status === 'draft' || status === 'needs_changes' ? 'exhibitions:edit' : 'exhibitions:publish');
const allowedActions = (staff: Staff, status: PublicationStatus): WorkflowAction[] =>
  availableWorkflowActions(status).filter((a) => {
    const r = applyWorkflowAction(status, a);
    return r.ok && hasGrant(staff.grants, `exhibitions:${r.permission}`);
  });

export async function exhibitionAdminRoutes(app: FastifyInstance, { db, storage }: { db: PrismaClient; storage: ObjectStorage }): Promise<void> {
  const requireRead = (request: FastifyRequest) => {
    const staff = staffOf(request);
    if (!canRead(staff)) throw new ApiError(403, 'FORBIDDEN', 'Exhibition permission required');
    return staff;
  };

  async function current(id: string) {
    const e = await db.exhibition.findUnique({ where: { id }, select: { publicationStatus: true, createdById: true, updatedAt: true, deletedAt: true } });
    if (!e || e.deletedAt) throw notFound();
    return e;
  }

  async function requireEditable(request: FastifyRequest, id: string) {
    const staff = staffOf(request);
    const e = await current(id);
    if (!canEdit(staff, e.publicationStatus)) throw new ApiError(403, 'FORBIDDEN', 'Editing in this status requires exhibitions:publish');
    return { staff, exhibition: e };
  }

  async function labelOf(tx: PrismaClient | Prisma.TransactionClient, id: string): Promise<string> {
    const list = await tx.exhibitionTranslation.findMany({ where: { exhibitionId: id }, select: { locale: true, title: true } });
    return (list.find((t) => t.locale === 'ru') ?? list[0])?.title ?? id;
  }

  async function completenessIssues(tx: PrismaClient | Prisma.TransactionClient, id: string) {
    const e = await tx.exhibition.findUniqueOrThrow({
      where: { id },
      include: { translations: true, items: { orderBy: { sortOrder: 'asc' }, include: { translations: true } } },
    });
    const byLocale = <T extends { locale: Locale }>(list: T[]) => Object.fromEntries(list.map((t) => [t.locale, t])) as Partial<Record<Locale, T>>;
    return exhibitionCompletenessIssues({
      translations: byLocale(e.translations),
      items: e.items.map((i) => ({ hasImage: i.assetId !== null, translations: byLocale(i.translations) })),
    });
  }

  async function topicIds(slugs: string[]): Promise<string[]> {
    if (!slugs.length) return [];
    const rows = await db.category.findMany({ where: { kind: 'exhibition_topic', slug: { in: slugs } }, select: { id: true, slug: true } });
    if (rows.length !== new Set(slugs).size) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown topic', [{ path: ['topics'], code: 'unknown' }]);
    return rows.map((r) => r.id);
  }

  async function saveExhibitionTranslations(tx: Prisma.TransactionClient, id: string, input: ExhibitionInput): Promise<void> {
    for (const locale of LOCALES) {
      const t = input.translations[locale];
      if (!t?.title) {
        await tx.exhibitionTranslation.deleteMany({ where: { exhibitionId: id, locale } });
        continue;
      }
      const data = { title: t.title, lead: t.lead, description: t.description, translationStatus: 'reviewed' as const };
      await tx.exhibitionTranslation.upsert({ where: { exhibitionId_locale: { exhibitionId: id, locale } }, update: data, create: { exhibitionId: id, locale, ...data } });
    }
  }

  async function saveItemTranslations(tx: Prisma.TransactionClient, itemId: string, input: ExhibitionItemInput): Promise<void> {
    for (const locale of LOCALES) {
      const t = input.translations[locale];
      if (!t?.title) {
        await tx.exhibitionItemTranslation.deleteMany({ where: { itemId, locale } });
        continue;
      }
      const data = { title: t.title, description: t.description, sourceNote: t.sourceNote, altText: t.altText, translationStatus: 'reviewed' as const };
      await tx.exhibitionItemTranslation.upsert({ where: { itemId_locale: { itemId, locale } }, update: data, create: { itemId, locale, ...data } });
    }
  }

  const requireItemTitle = (input: ExhibitionItemInput) => {
    if (!LOCALES.some((l) => input.translations[l]?.title)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Title is required', [{ path: ['translations', 'ru', 'title'], code: 'required' }]);
    }
  };

  async function checkDocument(documentId: string | null): Promise<void> {
    if (!documentId) return;
    const doc = await db.document.findUnique({ where: { id: documentId }, select: { deletedAt: true } });
    if (!doc || doc.deletedAt) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown document', [{ path: ['documentId'], code: 'unknown' }]);
  }

  /** После правки опубликованной выставки она не должна стать неполной (F-146 для выставок). */
  async function assertComplete(tx: PrismaClient | Prisma.TransactionClient, id: string): Promise<void> {
    const issues = await completenessIssues(tx, id);
    if (issues.length) throw new ApiError(422, 'INCOMPLETE_RECORD', 'Required fields are missing', issues);
  }

  async function touch(tx: Prisma.TransactionClient, id: string, userId: string, status: PublicationStatus) {
    await tx.exhibition.update({ where: { id }, data: { updatedById: userId } });
    if (status !== 'draft' && status !== 'needs_changes') await assertComplete(tx, id);
  }

  app.get('/admin/exhibitions', async (request) => {
    requireRead(request);
    const rows = await db.exhibition.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { id: true, slug: true, publicationStatus: true, dataOrigin: true, updatedAt: true, translations: { select: { locale: true, title: true } }, _count: { select: { items: true } } },
    });
    return {
      items: rows.map((e) => ({
        id: e.id,
        slug: e.slug,
        status: e.publicationStatus,
        dataOrigin: e.dataOrigin,
        title: (e.translations.find((t) => t.locale === 'ru') ?? e.translations[0])?.title ?? null,
        itemCount: e._count.items,
        updatedAt: e.updatedAt.toISOString(),
      })),
    };
  });

  app.get('/admin/exhibitions/topics', async (request) => {
    requireRead(request);
    const rows = await db.category.findMany({
      where: { kind: 'exhibition_topic' },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      select: { slug: true, translations: { where: { locale: 'ru' }, select: { name: true } } },
    });
    return { items: rows.map((c) => ({ slug: c.slug, name: c.translations[0]?.name ?? c.slug })) };
  });

  app.get('/admin/exhibitions/:id', async (request) => {
    const staff = requireRead(request);
    const { id } = ids.parse(request.params);
    const e = await db.exhibition.findUnique({
      where: { id },
      include: {
        translations: true,
        categories: { select: { category: { select: { slug: true } } } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            translations: true,
            asset: { select: { mimeType: true, antivirusStatus: true, processingStatus: true, originalFilename: true } },
            document: { select: { id: true, deletedAt: true, translations: { where: { locale: 'ru' }, select: { title: true } } } },
          },
        },
      },
    });
    if (!e || e.deletedAt) throw notFound();
    const history = await db.auditLog.findMany({
      where: { entityType: 'exhibitions', entityId: id },
      orderBy: { occurredAt: 'desc' },
      take: 50,
      select: { occurredAt: true, action: true, summary: true, userId: true },
    });
    const users = await db.user.findMany({ where: { id: { in: history.map((h) => h.userId).filter((x): x is string => x !== null) } }, select: { id: true, fullName: true } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    const tr = <T extends { locale: Locale }, R>(list: T[], pick: (t: T) => R) => Object.fromEntries(list.map((t) => [t.locale, pick(t)]));
    return {
      id: e.id,
      status: e.publicationStatus,
      updatedAt: e.updatedAt.toISOString(),
      input: {
        slug: e.slug,
        yearFrom: e.yearFrom,
        yearTo: e.yearTo,
        isFeatured: e.isFeatured,
        dataOrigin: e.dataOrigin,
        topics: e.categories.map((c) => c.category.slug),
        translations: tr(e.translations, (t) => ({ title: t.title, lead: t.lead, description: t.description })),
      },
      items: e.items.map((i, index) => ({
        id: i.id,
        number: index + 1,
        documentId: i.document && !i.document.deletedAt ? i.document.id : null,
        documentTitle: i.document && !i.document.deletedAt ? (i.document.translations[0]?.title ?? null) : null,
        image: i.asset
          ? { mimeType: i.asset.mimeType, antivirusStatus: i.asset.antivirusStatus, processingStatus: i.asset.processingStatus, filename: i.asset.originalFilename }
          : null,
        translations: tr(i.translations, (t) => ({ title: t.title, description: t.description, sourceNote: t.sourceNote, altText: t.altText })),
      })),
      issues: await completenessIssues(db, id),
      actions: allowedActions(staff, e.publicationStatus),
      canEdit: canEdit(staff, e.publicationStatus),
      canUpload: hasGrant(staff.grants, 'assets:upload'),
      history: history.map((h) => ({ at: h.occurredAt.toISOString(), action: h.action, summary: h.summary, user: h.userId ? (names.get(h.userId) ?? null) : null })),
    };
  });

  app.post('/admin/exhibitions', async (request, reply) => {
    const staff = requirePermission(request, 'exhibitions:edit');
    const input = exhibitionInputSchema.parse(request.body);
    if (!LOCALES.some((l) => input.translations[l]?.title)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Title is required', [{ path: ['translations', 'ru', 'title'], code: 'required' }]);
    }
    const categories = await topicIds(input.topics);
    try {
      const id = await db.$transaction(async (tx) => {
        const e = await tx.exhibition.create({
          data: {
            slug: input.slug, yearFrom: input.yearFrom, yearTo: input.yearTo, isFeatured: input.isFeatured, dataOrigin: input.dataOrigin,
            publicationStatus: 'draft', createdById: staff.session.userId, updatedById: staff.session.userId,
            categories: { create: categories.map((categoryId) => ({ categoryId })) },
          },
        });
        await saveExhibitionTranslations(tx, e.id, input);
        await writeAudit(tx, request, { userId: staff.session.userId, action: 'create', entityType: 'exhibitions', entityId: e.id, summary: `Создан черновик выставки «${await labelOf(tx, e.id)}»` });
        return e.id;
      });
      return reply.status(201).send({ id });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ApiError(409, 'CONFLICT', 'An exhibition with this address already exists', [{ path: ['slug'], code: 'duplicate' }]);
      }
      throw error;
    }
  });

  app.patch('/admin/exhibitions/:id', async (request) => {
    requireRead(request); // до разбора данных и поиска записи: без прав выставок — сразу 403
    const { id } = ids.parse(request.params);
    const { staff, exhibition } = await requireEditable(request, id);
    const ifMatch = request.headers['if-match'];
    if (typeof ifMatch === 'string' && ifMatch !== exhibition.updatedAt.toISOString()) {
      throw new ApiError(409, 'CONFLICT', 'The record was changed by someone else; reload it');
    }
    const input = exhibitionInputSchema.parse(request.body);
    if (!LOCALES.some((l) => input.translations[l]?.title)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Title is required', [{ path: ['translations', 'ru', 'title'], code: 'required' }]);
    }
    const categories = await topicIds(input.topics);
    try {
      await db.$transaction(async (tx) => {
        await tx.exhibition.update({
          where: { id },
          data: { slug: input.slug, yearFrom: input.yearFrom, yearTo: input.yearTo, isFeatured: input.isFeatured, dataOrigin: input.dataOrigin, updatedById: staff.session.userId },
        });
        await tx.exhibitionCategory.deleteMany({ where: { exhibitionId: id } });
        await tx.exhibitionCategory.createMany({ data: categories.map((categoryId) => ({ exhibitionId: id, categoryId })) });
        await saveExhibitionTranslations(tx, id, input);
        await touch(tx, id, staff.session.userId, exhibition.publicationStatus);
        await writeAudit(tx, request, { userId: staff.session.userId, action: 'update', entityType: 'exhibitions', entityId: id, summary: `Изменена выставка «${await labelOf(tx, id)}»` });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ApiError(409, 'CONFLICT', 'An exhibition with this address already exists', [{ path: ['slug'], code: 'duplicate' }]);
      }
      throw error;
    }
    return { id, updatedAt: (await current(id)).updatedAt.toISOString() };
  });

  app.delete('/admin/exhibitions/:id', async (request, reply) => {
    const { id } = ids.parse(request.params);
    const staff = requirePermission(request, 'exhibitions:publish');
    await current(id);
    if (!workflowBodySchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    await db.$transaction(async (tx) => {
      const label = await labelOf(tx, id);
      await tx.exhibition.update({ where: { id }, data: { deletedAt: new Date(), updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'exhibitions', entityId: id, summary: `Удалена выставка «${label}»` });
    });
    return reply.status(204).send();
  });

  app.post('/admin/exhibitions/:id/items', async (request, reply) => {
    requireRead(request); // до разбора данных и поиска записи: без прав выставок — сразу 403
    const { id } = ids.parse(request.params);
    const { staff, exhibition } = await requireEditable(request, id);
    const input = exhibitionItemInputSchema.parse(request.body);
    requireItemTitle(input);
    await checkDocument(input.documentId);
    const itemId = await db.$transaction(async (tx) => {
      const last = await tx.exhibitionItem.aggregate({ where: { exhibitionId: id }, _max: { sortOrder: true } });
      const item = await tx.exhibitionItem.create({ data: { exhibitionId: id, sortOrder: (last._max.sortOrder ?? 0) + 10, documentId: input.documentId } });
      await saveItemTranslations(tx, item.id, input);
      await touch(tx, id, staff.session.userId, exhibition.publicationStatus);
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'update', entityType: 'exhibitions', entityId: id, summary: `Добавлен экспонат к выставке «${await labelOf(tx, id)}»` });
      return item.id;
    });
    return reply.status(201).send({ id: itemId });
  });

  async function itemOf(id: string, itemId: string) {
    const item = await db.exhibitionItem.findUnique({ where: { id: itemId }, select: { exhibitionId: true, sortOrder: true } });
    if (!item || item.exhibitionId !== id) throw notFound();
    return item;
  }

  app.patch('/admin/exhibitions/:id/items/:itemId', async (request) => {
    requireRead(request); // до разбора данных и поиска записи: без прав выставок — сразу 403
    const { id, itemId } = itemIds.parse(request.params);
    const { staff, exhibition } = await requireEditable(request, id);
    await itemOf(id, itemId);
    const input = exhibitionItemInputSchema.parse(request.body);
    requireItemTitle(input);
    await checkDocument(input.documentId);
    await db.$transaction(async (tx) => {
      await tx.exhibitionItem.update({ where: { id: itemId }, data: { documentId: input.documentId } });
      await saveItemTranslations(tx, itemId, input);
      await touch(tx, id, staff.session.userId, exhibition.publicationStatus);
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'update', entityType: 'exhibitions', entityId: id, summary: `Изменён экспонат выставки «${await labelOf(tx, id)}»` });
    });
    return { id: itemId };
  });

  app.delete('/admin/exhibitions/:id/items/:itemId', async (request, reply) => {
    requireRead(request); // до разбора данных и поиска записи: без прав выставок — сразу 403
    const { id, itemId } = itemIds.parse(request.params);
    const { staff, exhibition } = await requireEditable(request, id);
    await itemOf(id, itemId);
    if (!workflowBodySchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    await db.$transaction(async (tx) => {
      await tx.exhibitionItem.delete({ where: { id: itemId } });
      await touch(tx, id, staff.session.userId, exhibition.publicationStatus);
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'update', entityType: 'exhibitions', entityId: id, summary: `Удалён экспонат выставки «${await labelOf(tx, id)}»` });
    });
    return reply.status(204).send();
  });

  /** Порядок экспонатов: кнопки «выше» и «ниже» (F-148; без обязательного перетаскивания). */
  app.post('/admin/exhibitions/:id/items/:itemId/move', async (request) => {
    requireRead(request); // до разбора данных и поиска записи: без прав выставок — сразу 403
    const { id, itemId } = itemIds.parse(request.params);
    const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(request.body);
    const { staff } = await requireEditable(request, id);
    const item = await itemOf(id, itemId);
    const neighbour = await db.exhibitionItem.findFirst({
      where: { exhibitionId: id, sortOrder: direction === 'up' ? { lt: item.sortOrder } : { gt: item.sortOrder } },
      orderBy: { sortOrder: direction === 'up' ? 'desc' : 'asc' },
      select: { id: true, sortOrder: true },
    });
    if (!neighbour) throw new ApiError(409, 'CONFLICT', 'The exhibit is already at the edge');
    await db.$transaction(async (tx) => {
      // Уникальность (exhibition_id, sort_order): меняем местами через временное значение.
      await tx.exhibitionItem.update({ where: { id: itemId }, data: { sortOrder: -1 } });
      await tx.exhibitionItem.update({ where: { id: neighbour.id }, data: { sortOrder: item.sortOrder } });
      await tx.exhibitionItem.update({ where: { id: itemId }, data: { sortOrder: neighbour.sortOrder } });
      await tx.exhibition.update({ where: { id }, data: { updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'update', entityType: 'exhibitions', entityId: id, summary: `Изменён порядок экспонатов выставки «${await labelOf(tx, id)}»` });
    });
    return { id: itemId };
  });

  app.post('/admin/exhibitions/:id/items/:itemId/image', async (request, reply) => {
    requireRead(request); // до разбора данных и поиска записи: без прав выставок — сразу 403
    const { id, itemId } = itemIds.parse(request.params);
    const { staff, exhibition } = await requireEditable(request, id);
    if (!hasGrant(staff.grants, 'assets:upload')) throw new ApiError(403, 'FORBIDDEN', 'Permission assets:upload required');
    await itemOf(id, itemId);
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new ApiError(400, 'VALIDATION_FAILED', 'File is required', [{ path: ['file'], code: 'required' }]);
    const mime = sniffImage(data);
    if (!mime) throw new ApiError(415, 'VALIDATION_FAILED', 'Only JPEG, PNG and WebP images are accepted', [{ path: ['file'], code: 'unsupported_type' }]);
    const rawName = request.headers['x-filename'];
    const filename = (typeof rawName === 'string' ? decodeURIComponent(rawName) : 'image').replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 200) || 'image';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    const key = `exhibitions/${id}/${randomUUID()}.${ext}`;
    await storage.write(MASTER_BUCKET, key, data);
    const { dataOrigin } = await db.exhibition.findUniqueOrThrow({ where: { id }, select: { dataOrigin: true } });
    const assetId = await db.$transaction(async (tx) => {
      const asset = await tx.digitalAsset.create({
        data: {
          kind: 'image', storageBucket: MASTER_BUCKET, storageKey: key, originalFilename: filename, mimeType: mime,
          sizeBytes: BigInt(data.length), sha256: createHash('sha256').update(data).digest('hex'),
          accessLevel: 'open', dataOrigin, processingStatus: 'ready', antivirusStatus: 'pending', createdById: staff.session.userId,
        },
      });
      await tx.exhibitionItem.update({ where: { id: itemId }, data: { assetId: asset.id } });
      await touch(tx, id, staff.session.userId, exhibition.publicationStatus);
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'upload', entityType: 'exhibitions', entityId: id,
        summary: `Загружено изображение экспоната («${filename}», ${mime}) к выставке «${await labelOf(tx, id)}»`,
        changes: { assetId: asset.id, itemId, sizeBytes: data.length },
      });
      return asset.id;
    });
    return reply.status(201).send({ assetId, mimeType: mime, antivirusStatus: 'pending' });
  });

  /** Предпросмотр изображения экспоната для сотрудников, в том числе до проверки антивирусом. */
  app.get('/admin/exhibitions/:id/items/:itemId/image', async (request, reply) => {
    requireRead(request);
    const { id, itemId } = itemIds.parse(request.params);
    await itemOf(id, itemId);
    const item = await db.exhibitionItem.findUniqueOrThrow({ where: { id: itemId }, select: { asset: { select: { storageBucket: true, storageKey: true, mimeType: true, deletedAt: true } } } });
    if (!item.asset || item.asset.deletedAt) throw notFound();
    const body = await storage.read(item.asset.storageBucket, item.asset.storageKey);
    if (!body) throw notFound();
    return reply
      .header('Content-Type', item.asset.mimeType)
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
      .send(body);
  });

  /** Согласование выставки (ТЗ §6.7): те же переходы, что у каталога, с правами exhibitions:*. */
  app.post('/admin/exhibitions/:id/:action', async (request) => {
    requireRead(request); // до разбора данных и поиска записи: без прав выставок — сразу 403
    const params = z.object({ id: z.uuid(), action: z.string().max(20) }).parse(request.params);
    const action = actionFromPath(params.action);
    if (!action) throw notFound();
    const body = workflowBodySchema.parse(request.body ?? {});
    const e = await current(params.id);
    const result = applyWorkflowAction(e.publicationStatus, action);
    if (!result.ok) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot ${action} from ${e.publicationStatus}`);
    const staff = requirePermission(request, `exhibitions:${result.permission}`);
    if (action === 'request_changes' && !body.comment) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Comment is required', [{ path: ['comment'], code: 'required' }]);
    }
    if (action === 'archive' && !body.confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Unpublishing must be confirmed');
    if (action === 'submit' || action === 'approve' || action === 'publish') await assertComplete(db, params.id);
    await db.$transaction(async (tx) => {
      await tx.exhibition.update({ where: { id: params.id }, data: { publicationStatus: result.to, updatedById: staff.session.userId } });
      const label = await labelOf(tx, params.id);
      await writeAudit(tx, request, {
        userId: staff.session.userId,
        action: 'status_change',
        entityType: 'exhibitions',
        entityId: params.id,
        summary: `Выставка «${label}»: ${STATUS_RU[e.publicationStatus]} → ${STATUS_RU[result.to]}${body.comment ? `. Комментарий: ${body.comment}` : ''}`,
        changes: { from: e.publicationStatus, to: result.to, ...(body.comment ? { comment: body.comment } : {}) },
      });
      await notifyWorkflow(tx, 'exhibitions', {
        entity: 'exhibitions', id: params.id, action, to: result.to, label, comment: body.comment ?? null,
        actorId: staff.session.userId, authorId: e.createdById,
      });
    });
    return { id: params.id, status: result.to };
  });
}
