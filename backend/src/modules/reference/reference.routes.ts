import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { langOnlySchema } from '@archive-vko/shared';
import { resolveLang } from '../../http/lang.ts';
import { bestTranslation } from '../../infrastructure/database/sql.ts';

/** Справочники для фильтров каталога (ТЗ §5.3, с. 5: тип, период, населённый пункт, тематика). */
export async function referenceRoutes(app: FastifyInstance, opts: { db: PrismaClient }): Promise<void> {
  const { db } = opts;

  app.get('/reference/document-types', async (request, reply) => {
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const items = await db.$queryRaw<Array<{ code: string; name: string | null }>>`
      SELECT d.code, n.name FROM document_types d ${bestTranslation('documentType', 'n', 'd.id', lang, ['name'])}
      ORDER BY d.sort_order`;
    return { items };
  });

  app.get('/reference/periods', async (request, reply) => {
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const items = await db.$queryRaw<Array<{ slug: string; name: string | null; yearFrom: number | null; yearTo: number | null }>>`
      SELECT p.slug, n.name, p.year_from AS "yearFrom", p.year_to AS "yearTo" FROM historical_periods p
      ${bestTranslation('period', 'n', 'p.id', lang, ['name'])}
      ORDER BY p.sort_order`;
    return { items };
  });

  app.get('/reference/settlements', async (request, reply) => {
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const rows = await db.$queryRaw<Array<{ id: string; slug: string; name: string | null }>>`
      SELECT s.id, s.slug, n.name FROM settlements s ${bestTranslation('settlement', 'n', 's.id', lang, ['name'])}
      ORDER BY n.name`;
    const historical = await db.settlementName.findMany({
      select: { settlementId: true, name: true, validFrom: true, validTo: true },
      orderBy: { validFrom: 'asc' },
    });
    return {
      items: rows.map((s) => ({
        slug: s.slug,
        name: s.name,
        historicalNames: historical
          .filter((h) => h.settlementId === s.id)
          .map(({ name, validFrom, validTo }) => ({ name, validFrom, validTo })),
      })),
    };
  });

  app.get('/reference/topics', async (request, reply) => {
    const query = z
      .object({ kind: z.enum(['catalog_topic', 'history_topic', 'news_rubric', 'exhibition_topic']).default('history_topic') })
      .and(langOnlySchema)
      .parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const items = await db.$queryRaw<Array<{ slug: string; name: string | null }>>`
      SELECT c.slug, n.name FROM categories c ${bestTranslation('category', 'n', 'c.id', lang, ['name'])}
      WHERE c.kind = ${query.kind}::"CategoryKind" ORDER BY c.sort_order`;
    return { items };
  });
}
