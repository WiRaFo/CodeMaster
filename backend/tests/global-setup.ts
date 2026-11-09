import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';
import { createPrismaClient } from '../src/infrastructure/database/client.ts';
import { runSeeds } from '../prisma/seeds/index.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/**
 * Каждый прогон создаёт собственную пустую базу на сервере из TEST_DATABASE_URL,
 * применяет миграции (`migrate deploy`), загружает сиды и удаляет эту базу после тестов.
 * Существующие базы, включая archive_test и archive_dev, не изменяются.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const baseUrl = process.env['TEST_DATABASE_URL'];
  if (!baseUrl) throw new Error('TEST_DATABASE_URL не задан (см. .env.example)');
  const dbName = `archive_test_run_${process.pid}_${Date.now()}`;
  const runUrl = new URL(baseUrl);
  runUrl.pathname = `/${dbName}`;

  const admin = createPrismaClient(baseUrl);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: runUrl.toString() },
    stdio: 'pipe',
  });
  const db = createPrismaClient(runUrl.toString());
  try {
    await runSeeds(db, ['migrated', 'synthetic', 'demo'], false);
  } finally {
    await db.$disconnect();
  }
  project.provide('testDatabaseUrl', runUrl.toString());

  return async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
