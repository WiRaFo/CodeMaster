import { describe, expect, it } from 'vitest';
import { parseSeedSets, runSeeds } from '../prisma/seeds/index.ts';
import { testDb } from './helpers.ts';

describe('наборы сидов', () => {
  it('разбирает SEED_SETS и отклоняет неизвестные наборы', () => {
    expect(parseSeedSets('demo, synthetic,migrated')).toEqual(['migrated', 'synthetic', 'demo']);
    expect(parseSeedSets(undefined)).toEqual(['migrated']);
    expect(() => parseSeedSets('real')).toThrow(/Неизвестный набор/);
  });

  it('не загружает synthetic и demo в production', async () => {
    const db = testDb();
    try {
      await expect(runSeeds(db, ['migrated', 'demo'], true)).rejects.toThrow(/production/);
      await expect(runSeeds(db, ['synthetic'], true)).rejects.toThrow(/production/);
    } finally {
      await db.$disconnect();
    }
  });
});
