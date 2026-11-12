import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyRequest } from 'fastify';

/** Действия журнала (ТЗ §6.8, с. 15; F-152). */
export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'account_locked'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'access_change'
  | 'upload';

export interface AuditEntry {
  userId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  summary: string;
  changes?: Prisma.InputJsonValue;
}

/**
 * Запись в журнал. Вызывается в той же транзакции, что и изменение: если запись журнала не прошла,
 * не сохраняется и само изменение. Журнал только дополняется, правка и удаление строк не предусмотрены.
 */
export async function writeAudit(db: PrismaClient | Prisma.TransactionClient, request: FastifyRequest, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      ...(entry.changes === undefined ? {} : { changes: entry.changes }),
      ip: request.ip,
      userAgent: request.headers['user-agent']?.slice(0, 300) ?? null,
      requestId: request.id,
    },
  });
}
