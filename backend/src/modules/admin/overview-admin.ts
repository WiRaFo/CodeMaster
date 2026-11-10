import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Locale } from '@archive-vko/shared';
import { ApiError, notFound } from '../../http/errors.ts';
import { pageOf } from '../../http/pagination.ts';
import { requirePermission, staffOf } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';
import { hasGrant } from '../auth/session.ts';
import { catalogBranchScope, ruFirst } from './admin-common.ts';

/**
 * Обзор панели: уведомления, сводка по каталогу, отзывы посетителей и журнал действий (ТЗ §6.7, §6.8; F-152, F-153).
 */
export async function overviewAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  app.get('/admin/notifications', async (request) => {
    const staff = staffOf(request);
    const roleIds = (await db.userRole.findMany({ where: { userId: staff.session.userId }, select: { roleId: true } })).map((r) => r.roleId);
    const items = await db.notification.findMany({
      where: { OR: [{ userId: staff.session.userId }, { roleId: { in: roleIds } }] },
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: 50,
    });
    return {
      unread: items.filter((n) => !n.readAt).length,
      items: items.map((n) => ({ id: n.id, type: n.type, entityType: n.entityType, entityId: n.entityId, message: n.message, createdAt: n.createdAt.toISOString(), read: n.readAt !== null })),
    };
  });

  app.post('/admin/notifications/:id/read', async (request, reply) => {
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const staff = staffOf(request);
    const roleIds = (await db.userRole.findMany({ where: { userId: staff.session.userId }, select: { roleId: true } })).map((r) => r.roleId);
    await db.notification.updateMany({ where: { id, readAt: null, OR: [{ userId: staff.session.userId }, { roleId: { in: roleIds } }] }, data: { readAt: new Date() } });
    return reply.status(204).send();
  });

  /** Сводка: документы по статусам, очередь на проверку (для проверяющих), мои документы на доработке. */
  app.get('/admin/dashboard', async (request) => {
    const staff = staffOf(request);
    if (catalogBranchScope(staff)?.length === 0) throw new ApiError(403, 'FORBIDDEN', 'Catalog permission required');
    const counts = await db.document.groupBy({ by: ['publicationStatus'], where: { deletedAt: null }, _count: { _all: true } });
    const short = (d: { id: string; publicationStatus: string; updatedAt: Date; translations: Array<{ locale: Locale; title: string }> }) => ({
      id: d.id,
      status: d.publicationStatus,
      title: ruFirst(d.translations)?.title ?? null,
      updatedAt: d.updatedAt.toISOString(),
    });
    const select = { id: true, publicationStatus: true, updatedAt: true, translations: { select: { locale: true, title: true } } } as const;
    const canReview = hasGrant(staff.grants, 'catalog:review') || staff.grants.byBranch.has('catalog:review');
    const canPublish = hasGrant(staff.grants, 'catalog:publish') || staff.grants.byBranch.has('catalog:publish');
    const [review, publish, mine] = await Promise.all([
      canReview ? db.document.findMany({ where: { deletedAt: null, publicationStatus: 'in_review' }, orderBy: { updatedAt: 'asc' }, take: 20, select }) : [],
      canPublish ? db.document.findMany({ where: { deletedAt: null, publicationStatus: 'approved' }, orderBy: { updatedAt: 'asc' }, take: 20, select }) : [],
      db.document.findMany({
        where: { deletedAt: null, createdById: staff.session.userId, publicationStatus: { in: ['draft', 'needs_changes'] } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select,
      }),
    ]);
    return {
      counts: Object.fromEntries(counts.map((c) => [c.publicationStatus, c._count._all])),
      reviewQueue: review.map(short),
      publishQueue: publish.map(short),
      mine: mine.map(short),
    };
  });

  /** Отзывы и предложения посетителей (ЭТАП 7): чтение и смена статуса — право feedback:read. */
  app.get('/admin/feedback', async (request) => {
    requirePermission(request, 'feedback:read');
    const q = z
      .object({ status: z.enum(['new', 'read', 'archived']).optional(), page: z.coerce.number().int().min(1).max(10_000).default(1) })
      .parse(request.query);
    const where: Prisma.FeedbackMessageWhereInput = q.status ? { status: q.status } : { status: { not: 'archived' } };
    const [total, rows] = await Promise.all([
      db.feedbackMessage.count({ where }),
      db.feedbackMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 50, take: 50 }),
    ]);
    return pageOf(
      rows.map((r) => ({ id: r.id, topic: r.topic, message: r.message, contactEmail: r.contactEmail, locale: r.locale, pagePath: r.pagePath, status: r.status, createdAt: r.createdAt.toISOString() })),
      total,
      q.page,
      50,
    );
  });

  app.post('/admin/feedback/:id/status', async (request) => {
    const staff = requirePermission(request, 'feedback:read');
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const { status } = z.object({ status: z.enum(['new', 'read', 'archived']) }).parse(request.body);
    const before = await db.feedbackMessage.findUnique({ where: { id }, select: { status: true } });
    if (!before) throw notFound();
    await db.$transaction(async (tx) => {
      await tx.feedbackMessage.update({ where: { id }, data: { status, moderatedById: staff.session.userId, moderatedAt: new Date() } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'status_change', entityType: 'feedback', entityId: id, summary: `Отзыв: ${before.status} → ${status}`, changes: { status: { from: before.status, to: status } } });
    });
    return { id, status };
  });


  /** Журнал действий (F-152): только для права audit:read. */
  app.get('/admin/audit-logs', async (request) => {
    requirePermission(request, 'audit:read');
    const q = z
      .object({
        action: z.string().max(40).optional(),
        entityType: z.string().max(40).optional(),
        entityId: z.uuid().optional(),
        page: z.coerce.number().int().min(1).max(10_000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(request.query);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
    };
    const [total, rows] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({ where, orderBy: { occurredAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => x !== null) } }, select: { id: true, fullName: true } });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return pageOf(
      rows.map((r) => ({
        id: String(r.id),
        at: r.occurredAt.toISOString(),
        user: r.userId ? (names.get(r.userId) ?? null) : null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        summary: r.summary,
        ip: r.ip,
      })),
      total,
      q.page,
      q.pageSize,
    );
  });
}
