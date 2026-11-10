import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { langOnlySchema, paginationSchema, type Locale } from '@archive-vko/shared';
import { notFound } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { pageOf } from '../../http/pagination.ts';
import { bestTranslation } from '../../infrastructure/database/sql.ts';
import { documentSummaryDto } from '../catalog/catalog.mapper.ts';
import { CatalogRepository } from '../catalog/catalog.repository.ts';

/**
 * Тематические коллекции «Архива памяти» (ТЗ §5.6, F-081). Элементы коллекции разнотипные; каждый тип
 * проверяется по своему публичному источнику: документы — только из public_documents_v (закрытый или снятый
 * документ исчезает из коллекции и из счётчика), личности — только опубликованные.
 */
const PUBLIC_COLLECTION = Prisma.sql`c.publication_status = 'published' AND c.deleted_at IS NULL`;

/** Видимые элементы коллекции: id и тип в порядке коллекции. */
const visibleItems = (collectionId: Prisma.Sql) => Prisma.sql`
  SELECT ci.item_type::text AS item_type, ci.item_id, ci.sort_order FROM collection_items ci
  WHERE ci.collection_id = ${collectionId} AND (
    (ci.item_type = 'document' AND EXISTS (SELECT 1 FROM public_documents_v p WHERE p.id = ci.item_id))
    OR (ci.item_type = 'person' AND EXISTS (SELECT 1 FROM historical_persons hp WHERE hp.id = ci.item_id
          AND hp.publication_status = 'published' AND hp.deleted_at IS NULL)))`;

interface CollectionRow {
  id: string; slug: string; data_origin: string; is_featured: boolean;
  title: string | null; description: string | null; content_lang: string | null; translation_status: string | null; item_count: bigint;
}

const select = (lang: Locale) => Prisma.sql`
  SELECT c.id, c.slug, c.data_origin::text AS data_origin, c.is_featured, t.title, t.description,
         t.locale AS content_lang, t.translation_status,
         (SELECT count(*) FROM (${visibleItems(Prisma.sql`c.id`)}) v) AS item_count
  FROM collections c
  ${bestTranslation('collection', 't', 'c.id', lang, ['title', 'description'])}
  WHERE ${PUBLIC_COLLECTION} AND t.title IS NOT NULL`;

const summary = (r: CollectionRow) => ({
  slug: r.slug,
  title: r.title,
  description: r.description,
  itemCount: Number(r.item_count),
  dataOrigin: r.data_origin,
  contentLang: r.content_lang,
  translationStatus: r.translation_status,
});

const gallerySchema = langOnlySchema.and(paginationSchema.extend({ pageSize: z.coerce.number().int().min(1).max(48).default(24) }));

export async function collectionRoutes(app: FastifyInstance, opts: { db: PrismaClient }): Promise<void> {
  const { db } = opts;
  const catalog = new CatalogRepository(db);

  app.get('/history/collections', async (request, reply) => {
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const rows = await db.$queryRaw<CollectionRow[]>`${select(lang)} ORDER BY c.is_featured DESC, c.sort_order, c.slug`;
    return { items: rows.filter((r) => r.item_count > 0n).map(summary) };
  });

  app.get('/history/collections/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string().max(150) }).parse(request.params);
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [row] = await db.$queryRaw<CollectionRow[]>`${select(lang)} AND c.slug = ${slug}`;
    if (!row) throw notFound();
    const items = await db.$queryRaw<Array<{ item_type: string; item_id: string }>>`
      ${visibleItems(Prisma.sql`${row.id}::uuid`)} ORDER BY sort_order`;
    const ids = (type: string) => items.filter((i) => i.item_type === type).map((i) => i.item_id);
    const [documents, persons] = await Promise.all([
      catalog.documentsByIds(ids('document'), lang),
      db.$queryRaw<Array<{ id: string; slug: string; full_name: string; life_years_text: string | null; content_lang: string | null }>>`
        SELECT hp.id, hp.slug, t.full_name, t.life_years_text, t.locale AS content_lang FROM historical_persons hp
        ${bestTranslation('historicalPerson', 't', 'hp.id', lang, ['full_name', 'life_years_text'])}
        WHERE hp.id = ANY(${ids('person')}::uuid[]) AND t.full_name IS NOT NULL`,
    ]);
    const order = new Map(items.map((i, n) => [i.item_id, n]));
    const byOrder = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return {
      ...summary(row),
      documents: byOrder(documents).map((d) => documentSummaryDto(d, lang)),
      persons: byOrder(persons).map((p) => ({ slug: p.slug, fullName: p.full_name, lifeYears: p.life_years_text, contentLang: p.content_lang })),
    };
  });

  /**
   * Галерея (F-085): открытые документы с цифровой копией, первая страница как изображение. Источник —
   * public_document_pages_v: туда попадают только проверенные антивирусом страницы документов с итоговым доступом open.
   */
  app.get('/history/gallery', async (request, reply) => {
    const query = gallerySchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const firstPages = Prisma.sql`
      SELECT DISTINCT ON (pg.document_id) pg.document_id, pg.page_number, pg.width, pg.height
      FROM public_document_pages_v pg ORDER BY pg.document_id, pg.page_number`;
    const [pages, [count]] = await Promise.all([
      db.$queryRaw<Array<{ document_id: string; page_number: number; width: number | null; height: number | null }>>`
        SELECT f.* FROM (${firstPages}) f JOIN public_documents_v p ON p.id = f.document_id
        ORDER BY p.date_from NULLS LAST, p.id
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      db.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM (${firstPages}) f`,
    ]);
    const docs = new Map((await catalog.documentsByIds(pages.map((p) => p.document_id), lang)).map((d) => [d.id, d]));
    const items = pages.flatMap((p) => {
      const d = docs.get(p.document_id);
      if (!d) return [];
      return [{
        ...documentSummaryDto(d, lang),
        image: { url: `/api/v1/catalog/documents/${d.id}/pages/${p.page_number}/image`, width: p.width, height: p.height },
      }];
    });
    return pageOf(items, Number(count?.total ?? 0), query.page, query.pageSize);
  });
}
