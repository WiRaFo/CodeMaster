import { Prisma, type PrismaClient } from '@prisma/client';
import { inject } from 'vitest';
import { createPrismaClient } from '../src/infrastructure/database/client.ts';

export function testDb(): PrismaClient {
  return createPrismaClient(inject('testDatabaseUrl'));
}

/** Выполняет изменения и откатывает их, чтобы тесты не влияли друг на друга. */
export async function inRollback(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  const rollback = new Error('rollback');
  await db
    .$transaction(async (tx) => {
      await fn(tx);
      throw rollback;
    })
    .catch((error: unknown) => {
      if (error !== rollback) throw error;
    });
}

export async function publicDocKeys(db: PrismaClient | Prisma.TransactionClient): Promise<Map<string, string>> {
  const rows = await db.$queryRaw<Array<{ key: string; effective_access: string }>>`
    SELECT d.source_system_id AS key, p.effective_access::text AS effective_access
    FROM public_documents_v p JOIN documents d ON d.id = p.id
    WHERE d.data_origin = 'synthetic'`;
  return new Map(rows.map((r) => [r.key, r.effective_access]));
}

export async function publicPageKeys(db: PrismaClient | Prisma.TransactionClient): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ key: string }>>`
    SELECT d.source_system_id AS key
    FROM public_document_pages_v p JOIN documents d ON d.id = p.document_id
    ORDER BY 1`;
  return rows.map((r) => r.key);
}
