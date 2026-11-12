import { afterAll, describe, expect, it } from 'vitest';
import { inRollback, publicDocKeys, publicPageKeys, testDb } from './helpers.ts';

const db = testDb();
afterAll(() => db.$disconnect());

describe('public_documents_v (ТЗ §5.3, §8.1; docs/database-design.md §6)', () => {
  it('показывает только опубликованные открытые и ограниченные записи с опубликованными предками', async () => {
    const docs = await publicDocKeys(db);
    expect(Object.fromEntries(docs)).toEqual({
      'synthetic:TEST-1/1/1/1': 'open',
      'synthetic:TEST-1/1/1/2': 'restricted',
      'synthetic:TEST-1/1/1/5': 'open',
      // Документ open, но фонд restricted: эффективный уровень — самый строгий по цепочке.
      'synthetic:TEST-2/1/1/1': 'restricted',
    });
  });

  it('скрывает закрытые записи на любом уровне цепочки', async () => {
    const docs = await publicDocKeys(db);
    expect(docs.has('synthetic:TEST-1/1/1/3')).toBe(false); // закрыт сам документ
    expect(docs.has('synthetic:TEST-1/1/2/1')).toBe(false); // закрыто дело
    expect(docs.has('synthetic:TEST-3/1/1/1')).toBe(false); // закрыт фонд
  });

  it('скрывает записи с неопубликованным документом, делом или подразделением', async () => {
    const docs = await publicDocKeys(db);
    expect(docs.has('synthetic:TEST-1/1/1/4')).toBe(false);
    expect(docs.has('synthetic:TEST-1/1/3/1')).toBe(false);
    expect(docs.has('synthetic:TEST-4/1/1/1')).toBe(false);
  });

  it('скрывает документ сразу после закрытия описи и после мягкого удаления фонда', async () => {
    await inRollback(db, async (tx) => {
      await tx.inventory.updateMany({ where: { sourceSystemId: 'synthetic:TEST-1/1' }, data: { accessLevel: 'closed' } });
      const docs = await publicDocKeys(tx);
      expect(docs.has('synthetic:TEST-1/1/1/1')).toBe(false);
    });
    await inRollback(db, async (tx) => {
      await tx.fond.updateMany({ where: { sourceSystemId: 'synthetic:TEST-2' }, data: { deletedAt: new Date() } });
      const docs = await publicDocKeys(tx);
      expect(docs.has('synthetic:TEST-2/1/1/1')).toBe(false);
    });
  });
});

describe('public_document_pages_v', () => {
  it('отдаёт страницы только эффективно открытых документов с проверенной копией', async () => {
    // TEST-1/1/1/2 и TEST-2/1/1/1 ограничены, у TEST-1/1/1/5 антивирус не завершён.
    expect(await publicPageKeys(db)).toEqual(['synthetic:TEST-1/1/1/1']);
  });

  it('не отдаёт копию, если сам файл закрыт, даже при открытом документе', async () => {
    await inRollback(db, async (tx) => {
      await tx.digitalAsset.updateMany({
        where: { storageKey: { startsWith: 'synthetic/TEST-1/1/1/1/' } },
        data: { accessLevel: 'restricted' },
      });
      expect(await publicPageKeys(tx)).toEqual([]);
    });
  });
});

describe('public_fonds_v', () => {
  it('не показывает закрытые фонды и фонды неопубликованных подразделений', async () => {
    const rows = await db.$queryRaw<Array<{ fond_number: string }>>`
      SELECT fond_number FROM public_fonds_v WHERE data_origin = 'synthetic' ORDER BY 1`;
    expect(rows.map((r) => r.fond_number)).toEqual(['TEST-1', 'TEST-2', 'TEST-5']);
  });
});
