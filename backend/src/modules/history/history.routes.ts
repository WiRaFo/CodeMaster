import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { historyListSchema, langOnlySchema, type Locale } from '@archive-vko/shared';
import { notFound } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { pageOf } from '../../http/pagination.ts';
import { and, bestTranslation } from '../../infrastructure/database/sql.ts';
import { archiveCodeDto } from '../catalog/catalog.mapper.ts';

/**
 * «Большой архив памяти» — цифровая история региона (ТЗ §5.6, с. 8; F-080–F-084).
 * Только опубликованные, не удалённые публикации с наступившей датой публикации.
 * Связанный документ берётся из public_documents_v: закрытый не раскрывается ни названием, ни id.
 */
const PUBLIC_PUBLICATION = Prisma.sql`p.publication_status = 'published' AND p.deleted_at IS NULL
  AND p.published_at IS NOT NULL AND p.published_at <= now()`;

interface Row {
  id: string;
  slug: string;
  kind: string;
  period_text: string | null;
  year_from: number | null;
  year_to: number | null;
  published_at: Date;
  data_origin: string;
  source_note: string | null;
  authorship: string | null;
  source_url: string | null;
  document_id: string | null;
  title: string | null;
  lead: string | null;
  body_text: string | null;
  content_lang: string | null;
  translation_status: string | null;
  topics: Array<{ slug: string; name: string | null }>;
  settlements: Array<{ slug: string; name: string | null }>;
}

function select(lang: Locale): Prisma.Sql {
  return Prisma.sql`
    SELECT p.id, p.slug, p.kind::text AS kind, p.period_text, p.year_from, p.year_to, p.published_at,
           p.data_origin::text AS data_origin, p.source_note, p.authorship, p.source_url, p.document_id,
           t.title, t.lead, t.body_text, t.locale AS content_lang, t.translation_status,
           coalesce((
             SELECT json_agg(json_build_object('slug', c.slug, 'name', ct.name) ORDER BY c.sort_order)
             FROM publication_categories pc
             JOIN categories c ON c.id = pc.category_id AND c.kind = 'history_topic'
             ${bestTranslation('category', 'ct', 'c.id', lang, ['name'])}
             WHERE pc.publication_id = p.id
           ), '[]'::json) AS topics,
           coalesce((
             SELECT json_agg(json_build_object('slug', s.slug, 'name', st.name) ORDER BY s.slug)
             FROM publication_settlements ps
             JOIN settlements s ON s.id = ps.settlement_id
             ${bestTranslation('settlement', 'st', 's.id', lang, ['name'])}
             WHERE ps.publication_id = p.id
           ), '[]'::json) AS settlements
    FROM publications p
    ${bestTranslation('publication', 't', 'p.id', lang, ['title', 'lead', 'body_text'])}`;
}

const summary = (p: Row) => ({
  slug: p.slug,
  kind: p.kind,
  title: p.title,
  lead: p.lead,
  periodText: p.period_text,
  yearFrom: p.year_from,
  yearTo: p.year_to,
  publishedAt: p.published_at.toISOString(),
  topics: p.topics,
  settlements: p.settlements,
  dataOrigin: p.data_origin,
  contentLang: p.content_lang,
  translationStatus: p.translation_status,
});

export async function historyRoutes(app: FastifyInstance, opts: { db: PrismaClient }): Promise<void> {
  const { db } = opts;

  app.get('/history', async (request, reply) => {
    const query = historyListSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const conds: Prisma.Sql[] = [PUBLIC_PUBLICATION];
    if (query.topic) {
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM publication_categories pc JOIN categories c ON c.id = pc.category_id
                                    WHERE pc.publication_id = p.id AND c.kind = 'history_topic' AND c.slug = ${query.topic})`);
    }
    if (query.settlement) {
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM publication_settlements ps JOIN settlements s ON s.id = ps.settlement_id
                                    WHERE ps.publication_id = p.id AND s.slug = ${query.settlement})`);
    }
    if (query.period) {
      // Пересечение лет публикации с годами периода; публикации без лет под фильтр периода не попадают.
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM historical_periods hp WHERE hp.slug = ${query.period}
                                    AND p.year_from IS NOT NULL
                                    AND (hp.year_to IS NULL OR p.year_from <= hp.year_to)
                                    AND (hp.year_from IS NULL OR coalesce(p.year_to, p.year_from) >= hp.year_from))`);
    }
    const where = and(conds);
    const offset = (query.page - 1) * query.pageSize;
    const [rows, [count], topics] = await Promise.all([
      db.$queryRaw<Row[]>`${select(lang)} ${where} ORDER BY p.is_featured DESC, p.published_at DESC, p.slug LIMIT ${query.pageSize} OFFSET ${offset}`,
      db.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM publications p ${where}`,
      db.$queryRaw<Array<{ slug: string; name: string | null; count: bigint }>>`
        SELECT c.slug, ct.name,
               (SELECT count(*) FROM publication_categories pc JOIN publications p ON p.id = pc.publication_id
                WHERE pc.category_id = c.id AND ${PUBLIC_PUBLICATION}) AS count
        FROM categories c ${bestTranslation('category', 'ct', 'c.id', lang, ['name'])}
        WHERE c.kind = 'history_topic'
        ORDER BY c.sort_order`,
    ]);
    return {
      ...pageOf(rows.map(summary), Number(count?.total ?? 0), query.page, query.pageSize),
      topics: topics.map((x) => ({ slug: x.slug, name: x.name, count: Number(x.count) })),
    };
  });

  app.get('/history/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string().max(150) }).parse(request.params);
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [p] = await db.$queryRaw<Row[]>`${select(lang)} WHERE ${PUBLIC_PUBLICATION} AND p.slug = ${slug}`;
    if (!p) throw notFound();
    const [docs, related] = await Promise.all([
      p.document_id
        ? db.$queryRaw<Array<{ id: string; fond_number: string; inventory_number: string; case_number: string; sheets_from: string | null; sheets_to: string | null; effective_access: string; title: string | null }>>`
            SELECT d.id, d.fond_number, d.inventory_number, d.case_number, d.sheets_from, d.sheets_to, d.effective_access::text AS effective_access, t.title
            FROM public_documents_v d ${bestTranslation('document', 't', 'd.id', lang, ['title'])}
            WHERE d.id = ${p.document_id}::uuid`
        : Promise.resolve([]),
      db.$queryRaw<Row[]>`${select(lang)} WHERE ${PUBLIC_PUBLICATION} AND p.id <> ${p.id}::uuid
        AND EXISTS (SELECT 1 FROM publication_categories a JOIN publication_categories b ON a.category_id = b.category_id
                    WHERE a.publication_id = p.id AND b.publication_id = ${p.id}::uuid)
        ORDER BY p.published_at DESC LIMIT 3`,
    ]);
    const doc = docs[0];
    return {
      ...summary(p),
      bodyText: p.body_text,
      sourceNote: p.source_note,
      authorship: p.authorship,
      sourceUrl: p.source_url,
      document: doc ? { id: doc.id, title: doc.title, access: doc.effective_access, code: archiveCodeDto(doc, lang) } : null,
      related: related.map(summary),
    };
  });
}
