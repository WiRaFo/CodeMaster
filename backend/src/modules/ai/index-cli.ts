import 'dotenv/config';
import { loadEnv } from '../../config/env.ts';
import { createPrismaClient } from '../../infrastructure/database/client.ts';
import { createEmbeddingProvider } from './embeddings.ts';
import { indexPublicDocuments } from './indexer.ts';

/** npm run ai:index — пересчитать векторы публичных документов (после импорта или публикации). */
const env = loadEnv();
const provider = createEmbeddingProvider(env);
if (!provider) {
  console.log('AI_PROVIDER=none: смысловой поиск выключен, индексировать нечего');
  process.exit(0);
}
const db = createPrismaClient(env.DATABASE_URL);
try {
  const report = await indexPublicDocuments(db, provider);
  console.log(`Смысловой индекс (${provider.model}): новых и изменённых ${report.indexed}, без изменений ${report.unchanged}, удалено ${report.removed}`);
} finally {
  await db.$disconnect();
}
