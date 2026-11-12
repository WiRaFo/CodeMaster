import 'dotenv/config';
import { loadEnv } from '../../config/env.ts';
import { createPrismaClient } from '../../infrastructure/database/client.ts';
import { LocalStorage } from '../../infrastructure/storage/local-storage.ts';
import { scanPendingAssets } from './scan-pending.ts';
import { createVirusScanner } from './scanner.ts';

/** Разовая проверка очереди: `npm run antivirus:scan -w backend`. Сервер делает то же в фоне. */
const env = loadEnv();
const scanner = createVirusScanner(env);
if (!scanner) {
  console.log('ANTIVIRUS_PROVIDER=none: антивирус не подключён, файлы остаются «ожидают проверки»');
} else {
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const report = await scanPendingAssets(db, new LocalStorage(env.STORAGE_DIR), scanner, { limit: 1000 });
    console.log(`${scanner.name}: чистых ${report.clean}, заражённых ${report.infected}, не проверено ${report.failed}`);
    if (report.failed > 0) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
