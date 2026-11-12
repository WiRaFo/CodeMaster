import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { EmbeddingProvider } from './embeddings.ts';
import { toPgVector } from './embeddings.ts';

/**
 * Индексация для смыслового поиска. В индекс попадают только документы из public_documents_v
 * и только поля, которые видит посетитель карточки: название и описание (без расшифровок и закрытых полей).
 * Документ, переставший быть публичным, удаляется из индекса; поиск всё равно проверяет публичность заново.
 */

const BATCH = 16;

interface SourceRow { document_id: string; locale: string; title: string; description: string | null }

export const embeddingText = (r: Pick<SourceRow, 'title' | 'description'>): string => [r.title, r.description].filter(Boolean).join('\n');
const hashOf = (text: string) => createHash('sha256').update(text).digest('hex');

export interface IndexReport { indexed: number; unchanged: number; removed: number }

export async function indexPublicDocuments(db: PrismaClient, provider: EmbeddingProvider): Promise<IndexReport> {
  const rows = await db.$queryRaw<SourceRow[]>`
    SELECT t.document_id, t.locale::text AS locale, t.title, t.description
    FROM document_translations t
    JOIN public_documents_v p ON p.id = t.document_id
    WHERE t.translation_status <> 'missing'`;
  const existing = new Map(
    (await db.$queryRaw<Array<{ document_id: string; locale: string; content_hash: string }>>`
      SELECT document_id, locale::text AS locale, content_hash FROM document_embeddings WHERE model = ${provider.model}`)
      .map((e) => [`${e.document_id}:${e.locale}`, e.content_hash]),
  );
  const todo = rows
    .map((r) => ({ ...r, text: embeddingText(r) }))
    .map((r) => ({ ...r, hash: hashOf(r.text) }))
    .filter((r) => existing.get(`${r.document_id}:${r.locale}`) !== r.hash);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const vectors = await provider.embed(batch.map((r) => r.text));
    for (const [k, r] of batch.entries()) {
      const vector = vectors[k];
      if (!vector) continue;
      await db.$executeRaw`
        INSERT INTO document_embeddings (document_id, locale, model, content_hash, embedding, updated_at)
        VALUES (${r.document_id}::uuid, ${r.locale}::"Locale", ${provider.model}, ${r.hash}, ${toPgVector(vector)}::vector, now())
        ON CONFLICT (document_id, locale, model)
        DO UPDATE SET content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding, updated_at = now()`;
    }
  }

  const removed = await db.$executeRaw`
    DELETE FROM document_embeddings e
    WHERE NOT EXISTS (SELECT 1 FROM public_documents_v p WHERE p.id = e.document_id)
       OR NOT EXISTS (SELECT 1 FROM document_translations t WHERE t.document_id = e.document_id AND t.locale = e.locale AND t.translation_status <> 'missing')`;
  return { indexed: todo.length, unchanged: rows.length - todo.length, removed };
}
