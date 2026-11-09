import { afterAll, describe, expect, it } from 'vitest';
import { inRollback, testDb } from './helpers.ts';

const db = testDb();
afterAll(() => db.$disconnect());

async function searchTitles(config: 'russian' | 'simple' | 'english', locale: string, query: string): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ title: string }>>`
    SELECT title FROM document_translations
    WHERE locale = ${locale}::"Locale" AND search_vector @@ plainto_tsquery(${config}::regconfig, ${query})
    ORDER BY title`;
  return rows.map((r) => r.title);
}

describe('полнотекстовый поиск (ТЗ §5.8)', () => {
  it('русская морфология: «маслозаводы» находит «маслозавода»', async () => {
    const titles = await searchTitles('russian', 'ru', 'маслозаводы');
    expect(titles).toContain('[Синтетика] Протокол заседания правления маслозавода');
  });

  it('казахский текст индексируется конфигурацией simple', async () => {
    const titles = await searchTitles('simple', 'kk', 'хаттамасы');
    expect(titles).toEqual(['[Синтетикалық] Май зауыты басқармасы отырысының хаттамасы']);
  });

  it('вектор пересчитывается при изменении перевода', async () => {
    await inRollback(db, async (tx) => {
      await tx.documentTranslation.updateMany({
        where: { locale: 'en', title: { startsWith: '[Synthetic] Minutes' } },
        data: { description: 'creamery butter churns' },
      });
      const rows = await tx.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM document_translations
        WHERE locale = 'en' AND search_vector @@ plainto_tsquery('english', 'churn')`;
      expect(rows[0]?.n).toBe(1n);
    });
  });
});

describe('триггер has_digital_copy', () => {
  it('ставится при наличии страниц и снимается после их удаления', async () => {
    const doc = await db.document.findFirstOrThrow({ where: { sourceSystemId: 'synthetic:TEST-1/1/1/1' } });
    expect(doc.hasDigitalCopy).toBe(true);
    const noCopy = await db.document.findFirstOrThrow({ where: { sourceSystemId: 'synthetic:TEST-1/1/1/3' } });
    expect(noCopy.hasDigitalCopy).toBe(false);
    await inRollback(db, async (tx) => {
      await tx.documentAsset.deleteMany({ where: { documentId: doc.id } });
      const after = await tx.document.findUniqueOrThrow({ where: { id: doc.id } });
      expect(after.hasDigitalCopy).toBe(false);
    });
  });
});

describe('ограничения целостности', () => {
  it('verified-документ без источника отклоняется', async () => {
    const doc = await db.document.findFirstOrThrow({ where: { sourceSystemId: 'synthetic:TEST-1/1/1/1' } });
    await expect(
      inRollback(db, async (tx) => {
        await tx.document.update({ where: { id: doc.id }, data: { dataOrigin: 'verified', sourceNote: null } });
      }),
    ).rejects.toThrow(/check constraint|documents_/i);
  });

  it('второе основное подразделение отклоняется', async () => {
    await expect(
      inRollback(db, async (tx) => {
        await tx.branch.update({ where: { slug: 'zaisan' }, data: { isMain: true } });
      }),
    ).rejects.toThrow(/branches_single_main_idx|Unique constraint/i);
  });

  it('координаты вне диапазона отклоняются', async () => {
    await expect(
      inRollback(db, async (tx) => {
        await tx.branch.update({ where: { slug: 'ridder' }, data: { lat: 120, lng: 82 } });
      }),
    ).rejects.toThrow();
  });
});

describe('перенесённые данные (docs/requirements-matrix.md Q-22, Q-23)', () => {
  it('подразделения помечены migrated, имеют источник, не сверены и не выводятся на карту', async () => {
    const branches = await db.branch.findMany({ where: { dataOrigin: 'migrated' }, orderBy: { sortOrder: 'asc' } });
    expect(branches.map((b) => b.slug)).toEqual(['main', 'main-krylova', 'ust-kamenogorsk-personnel', 'zaisan', 'ridder', 'altai']);
    for (const b of branches) {
      expect(b.sourceUrl).toMatch(/^http:\/\/e-arhiv\.vko\.gov\.kz\//);
      expect(b.verifiedAt).toBeNull();
      expect(b.lat).toBeNull();
      expect(b.lng).toBeNull();
      expect(b.showOnMap).toBe(false);
      expect(b.postalCode).toBeNull();
    }
  });

  it('у каждой роли из ТЗ §6.1 есть права, у главного администратора — все', async () => {
    const roles = await db.role.findMany({ include: { _count: { select: { permissions: true } } } });
    expect(roles).toHaveLength(7);
    const total = await db.permission.count();
    for (const r of roles) expect(r._count.permissions).toBeGreaterThan(0);
    expect(roles.find((r) => r.code === 'super_admin')?._count.permissions).toBe(total);
  });
});
