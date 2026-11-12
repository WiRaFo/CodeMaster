import 'dotenv/config';
import { loadEnv } from './config/env.ts';
import { buildApp } from './app.ts';
import { createPrismaClient } from './infrastructure/database/client.ts';
import { LocalStorage } from './infrastructure/storage/local-storage.ts';
import { createEmbeddingProvider } from './modules/ai/embeddings.ts';
import { indexPublicDocuments } from './modules/ai/indexer.ts';

const env = loadEnv();
const db = createPrismaClient(env.DATABASE_URL);
const embeddings = createEmbeddingProvider(env);
const app = await buildApp({
  db,
  storage: new LocalStorage(env.STORAGE_DIR),
  logLevel: env.LOG_LEVEL,
  secureCookies: env.NODE_ENV === 'production',
  allowedOrigins: env.ADMIN_ALLOWED_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  embeddings,
  aiTimeoutMs: env.AI_TIMEOUT_MS,
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });

// Смысловой индекс обновляется в фоне при запуске; пока модель недоступна, сайт работает на обычном поиске.
if (embeddings) {
  indexPublicDocuments(db, embeddings).then(
    (r) => app.log.info({ model: embeddings.model, ...r }, 'semantic index updated'),
    (error: unknown) => app.log.warn({ model: embeddings.model, error: String(error) }, 'semantic index not updated: model unavailable'),
  );
}
