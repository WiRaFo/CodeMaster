import 'dotenv/config';
import { loadEnv } from './config/env.ts';
import { buildApp } from './app.ts';
import { createPrismaClient } from './infrastructure/database/client.ts';

const env = loadEnv();
const db = createPrismaClient(env.DATABASE_URL);
const app = await buildApp({ db, logLevel: env.LOG_LEVEL });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.HOST, port: env.PORT });
