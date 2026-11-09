import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../src/infrastructure/database/client.ts';
import { seedAdmin } from './admin.ts';
import { seedDemo } from './demo.ts';
import { seedMigrated } from './migrated.ts';
import { seedReference } from './reference.ts';
import { seedSynthetic } from './synthetic.ts';

export const SEED_SETS = ['migrated', 'synthetic', 'demo'] as const;
export type SeedSet = (typeof SEED_SETS)[number];

export function parseSeedSets(raw: string | undefined): SeedSet[] {
  const requested = (raw ?? 'migrated').split(',').map((s) => s.trim()).filter(Boolean);
  for (const s of requested) {
    if (!(SEED_SETS as readonly string[]).includes(s)) throw new Error(`Неизвестный набор сидов: ${s}`);
  }
  return SEED_SETS.filter((s) => requested.includes(s));
}

/** Справочники всегда; затем выбранные наборы. synthetic и demo запрещены в production. */
export async function runSeeds(db: PrismaClient, sets: SeedSet[], production: boolean): Promise<void> {
  if (production && sets.some((s) => s !== 'migrated')) {
    throw new Error('Наборы synthetic и demo нельзя загружать в production');
  }
  // synthetic строит каталог внутри подразделения main из набора migrated.
  if (sets.includes('synthetic') && !sets.includes('migrated')) throw new Error('Набор synthetic требует migrated');
  await seedReference(db);
  if (sets.includes('migrated')) await seedMigrated(db);
  if (sets.includes('synthetic')) await seedSynthetic(db);
  if (sets.includes('demo')) await seedDemo(db);
}

async function main(): Promise<void> {
  const db = createPrismaClient();
  try {
    const sets = parseSeedSets(process.env['SEED_SETS']);
    const production = process.env['NODE_ENV'] === 'production';
    await runSeeds(db, sets, production);
    const email = process.env['SEED_ADMIN_EMAIL'];
    const password = process.env['SEED_ADMIN_PASSWORD'];
    if (email && password) await seedAdmin(db, email, password);
    else console.warn('SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD не заданы: администратор не создан');
    console.log(`Сиды загружены: справочники, ${sets.join(', ')}`);
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
