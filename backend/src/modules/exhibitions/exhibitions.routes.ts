import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { exhibitionListSchema, langOnlySchema, type Locale } from '@archive-vko/shared';
import { notFound } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { pageOf } from '../../http/pagination.ts';
import { and, bestTranslation } from '../../infrastructure/database/sql.ts';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import { archiveCodeDto } from '../catalog/catalog.mapper.ts';

/**
 * Онлайн-выставки (ТЗ §5.7, с. 9; F-090–F-092).
 * Выставки читаются только из public_exhibitions_v, изображения экспонатов — только из public_exhibition_images_v.
 * Ссылка экспоната на документ или фонд показывается, только если запись есть в public_documents_v / public_fonds_v;
 * иначе экспонат остаётся, но без ссылки и без сведений о закрытой записи.
 */

const VIEWABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const SLUG = z.string().max(200).regex(/^[a-z0-9-]+$/);

interface ExhibitionRow {
  id: string;
  slug: string;
  year_from: number | null;
  year_to: number | null;
  opens_at: Date | null;
  closes_at: Date | null;
  data_origin: string;
  title: string | null;
  lead: string | null;
  content_lang: string | null;
  translation_status: string | null;
}

interface TopicRow {
  exhibition_id: string;
  slug: string;
  name: string | null;
}

export async function exhibitionRoutes(app: FastifyInstance, opts: { db: PrismaClient; storage: ObjectStorage }): Promise<void> {
  const { db } = opts;

  async function topicsOf(ids: string[], lang: Locale): Promise<Map<string, Array<{ slug: string; name: string | null }>>> {
    const map = new Map<string, Array<{ slug: string; name: string | null }>>();
    if (!ids.length) return map;
    const rows = await db.$queryRaw<TopicRow[]>`
      SELECT ec.exhibition_id, c.slug, ct.name
      FROM exhibition_categories ec
      JOIN categories c ON c.id = ec.category_id AND c.kind = 'exhibition_topic'
      ${bestTranslation('category', 'ct', 'c.id', lang, ['name'])}
      WHERE ec.exhibition_id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY c.sort_order, c.slug`;
    for (const r of rows) map.set(r.exhibition_id, [...(map.get(r.exhibition_id) ?? []), { slug: r.slug, name: r.name }]);
    return map;
  }

  const summary = (e: ExhibitionRow) => ({
    slug: e.slug,
    title: e.title,
    lead: e.lead,
    yearFrom: e.year_from,
    yearTo: e.year_to,
    opensAt: e.opens_at ? e.opens_at.toISOString().slice(0, 10) : null,
    closesAt: e.closes_at ? e.closes_at.toISOString().slice(0, 10) : null,
    dataOrigin: e.data_origin,
    contentLang: e.content_lang,
    translationStatus: e.translation_status,
  });

  app.get('/exhibitions', async (request, reply) => {
    const query = exhibitionListSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const where: Prisma.Sql[] = [];
    if (query.topic) {
      where.push(Prisma.sql`EXISTS (SELECT 1 FROM exhibition_categories ec JOIN categories c ON c.id = ec.category_id
        WHERE ec.exhibition_id = e.id AND c.kind = 'exhibition_topic' AND c.slug = ${query.topic})`);
    }
    if (query.period) {
      // Выставка относится к периоду, если её годы пересекаются с годами периода.
      where.push(Prisma.sql`EXISTS (SELECT 1 FROM historical_periods hp WHERE hp.slug = ${query.period}
        AND (hp.year_to IS NULL OR e.year_from IS NULL OR e.year_from <= hp.year_to)
        AND (hp.year_from IS NULL OR coalesce(e.year_to, e.year_from) IS NULL OR coalesce(e.year_to, e.year_from) >= hp.year_from)
        AND (e.year_from IS NOT NULL OR e.year_to IS NOT NULL))`);
    }
    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows, coverRows, countRows, topicFacet] = await Promise.all([
      db.$queryRaw<ExhibitionRow[]>`
        SELECT e.id, e.slug, e.year_from, e.year_to, e.opens_at, e.closes_at, e.data_origin::text AS data_origin,
               t.title, t.lead, t.locale AS content_lang, t.translation_status
        FROM public_exhibitions_v e ${bestTranslation('exhibition', 't', 'e.id', lang, ['title', 'lead'])}
        ${and(where)}
        ORDER BY e.is_featured DESC, e.opens_at DESC NULLS LAST, e.created_at DESC, e.slug
        LIMIT ${query.pageSize} OFFSET ${offset}`,
      db.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM public_exhibitions_v e ${and(where)}`,
      // Обложка — первый экспонат с публичным изображением; номер — позиция экспоната на сайте.
      db.$queryRaw<Array<{ exhibition_id: string; position: bigint }>>`
        SELECT DISTINCT ON (o.exhibition_id) o.exhibition_id, o.position
        FROM (SELECT i.id, i.exhibition_id, row_number() OVER (PARTITION BY i.exhibition_id ORDER BY i.sort_order) AS position FROM exhibition_items i) o
        JOIN public_exhibition_images_v img ON img.item_id = o.id
        ORDER BY o.exhibition_id, o.position`,
      db.$queryRaw<Array<{ exhibition_id: string; n: bigint }>>`
        SELECT i.exhibition_id, count(*) AS n FROM exhibition_items i JOIN public_exhibitions_v e ON e.id = i.exhibition_id GROUP BY 1`,
      db.$queryRaw<Array<{ slug: string; name: string | null; n: bigint }>>`
        SELECT c.slug, ct.name, count(*) AS n
        FROM categories c
        JOIN exhibition_categories ec ON ec.category_id = c.id
        JOIN public_exhibitions_v e ON e.id = ec.exhibition_id
        ${bestTranslation('category', 'ct', 'c.id', lang, ['name'])}
        WHERE c.kind = 'exhibition_topic'
        GROUP BY c.slug, ct.name, c.sort_order
        ORDER BY c.sort_order, c.slug`,
    ]);
    const covers = new Map(coverRows.map((c) => [c.exhibition_id, Number(c.position)]));
    const counts = new Map(countRows.map((c) => [c.exhibition_id, Number(c.n)]));
    const topics = await topicsOf(rows.map((r) => r.id), lang);
    return {
      ...pageOf(
        rows.map((e) => ({
          ...summary(e),
          topics: topics.get(e.id) ?? [],
          itemCount: counts.get(e.id) ?? 0,
          coverItem: covers.get(e.id) ?? null,
        })),
        Number(totalRows[0]?.total ?? 0),
        query.page,
        query.pageSize,
      ),
      topics: topicFacet.map((t) => ({ slug: t.slug, name: t.name, count: Number(t.n) })),
    };
  });

  app.get('/exhibitions/:slug', async (request, reply) => {
    const parsed = z.object({ slug: SLUG }).safeParse(request.params);
    if (!parsed.success) throw notFound();
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [e] = await db.$queryRaw<Array<ExhibitionRow & { description: string | null }>>`
      SELECT e.id, e.slug, e.year_from, e.year_to, e.opens_at, e.closes_at, e.data_origin::text AS data_origin,
             t.title, t.lead, t.description, t.locale AS content_lang, t.translation_status
      FROM public_exhibitions_v e ${bestTranslation('exhibition', 't', 'e.id', lang, ['title', 'lead', 'description'])}
      WHERE e.slug = ${parsed.data.slug}`;
    if (!e) throw notFound();
    const items = await db.$queryRaw<
      Array<{
        sort_order: number;
        title: string | null;
        description: string | null;
        source_note: string | null;
        alt_text: string | null;
        content_lang: string | null;
        translation_status: string | null;
        has_image: boolean;
        width: number | null;
        height: number | null;
        doc_id: string | null;
        doc_access: string | null;
        fond_number: string | null;
        inventory_number: string | null;
        case_number: string | null;
        doc_title: string | null;
        fond_id: string | null;
        fond_fond_number: string | null;
        fond_title: string | null;
      }>
    >`
      SELECT i.sort_order, t.title, t.description, t.source_note, t.alt_text, t.locale AS content_lang, t.translation_status,
             (img.item_id IS NOT NULL) AS has_image, img.width, img.height,
             d.id AS doc_id, d.effective_access::text AS doc_access, d.fond_number, d.inventory_number, d.case_number, dt.title AS doc_title,
             f.id AS fond_id, f.fond_number AS fond_fond_number, ft.title AS fond_title
      FROM exhibition_items i
      LEFT JOIN LATERAL (
        SELECT tt.locale::text AS locale, tt.translation_status::text AS translation_status, tt.title, tt.description, tt.source_note, tt.alt_text
        FROM exhibition_item_translations tt
        WHERE tt.item_id = i.id AND tt.translation_status <> 'missing'
        ORDER BY (tt.locale = ${lang}::"Locale") DESC, (tt.locale = 'ru') DESC, tt.locale
        LIMIT 1
      ) t ON true
      LEFT JOIN public_exhibition_images_v img ON img.item_id = i.id
      LEFT JOIN public_documents_v d ON d.id = i.document_id
      ${bestTranslation('document', 'dt', 'd.id', lang, ['title'])}
      LEFT JOIN public_fonds_v f ON f.id = i.fond_id
      ${bestTranslation('fond', 'ft', 'f.id', lang, ['title'])}
      WHERE i.exhibition_id = ${e.id}::uuid
      ORDER BY i.sort_order`;
    const topics = await topicsOf([e.id], lang);
    return {
      ...summary(e),
      description: e.description,
      topics: topics.get(e.id) ?? [],
      items: items.map((i, index) => ({
        // Номер экспоната на сайте — позиция по порядку (1…N), а не внутренний sort_order.
        number: index + 1,
        title: i.title,
        description: i.description,
        sourceNote: i.source_note,
        contentLang: i.content_lang,
        translationStatus: i.translation_status,
        image: i.has_image ? { alt: i.alt_text, width: i.width, height: i.height } : null,
        document:
          i.doc_id && i.fond_number
            ? {
                id: i.doc_id,
                title: i.doc_title,
                access: i.doc_access,
                code: archiveCodeDto(
                  { fond_number: i.fond_number, inventory_number: i.inventory_number ?? '', case_number: i.case_number ?? '' },
                  lang,
                ),
              }
            : null,
        fond: i.fond_id && i.fond_fond_number ? { id: i.fond_id, number: i.fond_fond_number, title: i.fond_title } : null,
      })),
    };
  });

  app.get('/exhibitions/:slug/items/:number/image', async (request, reply) => {
    const parsed = z.object({ slug: SLUG, number: z.string().regex(/^[1-9]\d{0,3}$/) }).safeParse(request.params);
    if (!parsed.success) throw notFound();
    const position = Number(parsed.data.number);
    const [file] = await db.$queryRaw<Array<{ storage_bucket: string; storage_key: string; mime_type: string; asset_id: string }>>`
      SELECT img.storage_bucket, img.storage_key, img.mime_type, img.asset_id
      FROM (
        SELECT i.id, row_number() OVER (ORDER BY i.sort_order) AS position
        FROM exhibition_items i JOIN public_exhibitions_v e ON e.id = i.exhibition_id
        WHERE e.slug = ${parsed.data.slug}
      ) ordered
      JOIN public_exhibition_images_v img ON img.item_id = ordered.id
      WHERE ordered.position = ${position}`;
    if (!file || !VIEWABLE_TYPES.has(file.mime_type)) throw notFound();
    const body = await opts.storage.read(file.storage_bucket, file.storage_key);
    if (!body) {
      request.log.warn({ assetId: file.asset_id }, 'exhibition image is missing in storage');
      throw notFound();
    }
    return reply
      .header('Content-Type', file.mime_type)
      .header('Content-Disposition', 'inline')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
      .header('Cache-Control', 'public, max-age=300')
      .send(body);
  });
}
