import type { PrismaClient } from '@prisma/client';
import { toPgVector, type EmbeddingProvider } from './embeddings.ts';

/**
 * Смысловой поиск по индексу document_embeddings. Соединение с public_documents_v выполняется при каждом
 * запросе: документ, который закрыли или сняли с публикации после индексации, в ответ не попадёт.
 * Ошибка или медленный ответ модели не ломают выдачу: возвращается null, и сайт показывает обычный поиск.
 */

/** Ниже этого косинусного сходства совпадение считается случайным и не показывается. */
export const MIN_SIMILARITY = 0.35;

export interface SemanticHit { id: string; score: number }

export async function semanticSearch(
  db: PrismaClient,
  provider: EmbeddingProvider,
  query: string,
  { limit, timeoutMs }: { limit: number; timeoutMs: number },
): Promise<SemanticHit[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let vector: number[] | undefined;
  try {
    [vector] = await provider.embed([query], controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!vector) return null;
  const rows = await db.$queryRaw<Array<{ id: string; score: number }>>`
    SELECT e.document_id AS id, max(1 - (e.embedding <=> ${toPgVector(vector)}::vector))::float8 AS score
    FROM document_embeddings e
    JOIN public_documents_v p ON p.id = e.document_id
    WHERE e.model = ${provider.model} AND vector_dims(e.embedding) = ${vector.length}
    GROUP BY e.document_id
    HAVING max(1 - (e.embedding <=> ${toPgVector(vector)}::vector)) >= ${MIN_SIMILARITY}
    ORDER BY score DESC, e.document_id
    LIMIT ${limit}`;
  return rows;
}
