import 'dotenv/config';
import { loadEnv } from './config/env.ts';
import { buildApp } from './app.ts';
import { createPrismaClient } from './infrastructure/database/client.ts';
import { LocalStorage } from './infrastructure/storage/local-storage.ts';
import { createEmbeddingProvider } from './modules/ai/embeddings.ts';
import { indexPublicDocuments } from './modules/ai/indexer.ts';
import { scanPendingAssets } from './modules/antivirus/scan-pending.ts';
import { createVirusScanner } from './modules/antivirus/scanner.ts';

const env = loadEnv();
const db = createPrismaClient(env.DATABASE_URL);
const embeddings = createEmbeddingProvider(env);
const storage = new LocalStorage(env.STORAGE_DIR);
const scanner = createVirusScanner(env);
const app = await buildApp({
  db,
  storage,
  logLevel: env.LOG_LEVEL,
  secureCookies: env.NODE_ENV === 'production',
  allowedOrigins: env.ADMIN_ALLOWED_ORIGINS,
  trustProxy: env.TRUST_PROXY,
  embeddings,
  aiTimeoutMs: env.AI_TIMEOUT_MS,
});

let scanTimer: NodeJS.Timeout | null = null;
const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  if (scanTimer) clearInterval(scanTimer);
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

// Антивирус проверяет очередь загруженных файлов в фоне; пока он недоступен, файлы ждут и на сайт не попадают.
if (scanner) {
  let running = false;
  const scanOnce = async () => {
    if (running) return;
    running = true;
    try {
      const report = await scanPendingAssets(db, storage, scanner);
      if (report.clean + report.infected + report.failed > 0) app.log.info({ scanner: scanner.name, ...report }, 'antivirus scan');
    } catch (error: unknown) {
      app.log.warn({ scanner: scanner.name, error: String(error) }, 'antivirus scan failed');
    } finally {
      running = false;
    }
  };
  void scanOnce();
  scanTimer = setInterval(() => void scanOnce(), env.ANTIVIRUS_INTERVAL_S * 1000);
  scanTimer.unref();
}
