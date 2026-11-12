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
    SELECT DISTINCT d.source_system_id AS key
    FROM public_document_pages_v p JOIN documents d ON d.id = p.document_id
    ORDER BY 1`;
  return rows.map((r) => r.key);
}

/** Приложение Fastify поверх тестовой базы; запросы выполняются через app.inject без сети. */
export async function testApp(extra: Partial<Pick<import('../src/app.ts').AppOptions, 'embeddings' | 'aiTimeoutMs'>> = {}) {
  const { buildApp } = await import('../src/app.ts');
  const db = testDb();
  const { LocalStorage } = await import('../src/infrastructure/storage/local-storage.ts');
  const app = await buildApp({ db, storage: new LocalStorage(inject('testStorageDir')), logLevel: 'silent', ...extra });
  return {
    app,
    db,
    async get(url: string, headers: Record<string, string> = {}) {
      const res = await app.inject({ method: 'GET', url, headers });
      return { status: res.statusCode, headers: res.headers, rawPayload: res.rawPayload, body: res.json() as Record<string, unknown> & { items?: Array<Record<string, unknown>> }, raw: res.body };
    },
    async close() {
      await app.close();
      await db.$disconnect();
    },
  };
}

export async function idOf(db: PrismaClient, table: 'documents' | 'fonds' | 'inventories' | 'cases', key: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM ${table} WHERE source_system_id = $1`, `synthetic:${key}`);
  const id = rows[0]?.id;
  if (!id) throw new Error(`Нет записи ${table} ${key}`);
  return id;
}
