import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { langOnlySchema, newsListSchema, type Locale } from '@archive-vko/shared';
import { notFound } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { pageOf } from '../../http/pagination.ts';
import { and, bestTranslation } from '../../infrastructure/database/sql.ts';
import { archiveCodeDto, dateDto } from '../catalog/catalog.mapper.ts';

/**
 * Публичный контент главной страницы и ленты новостей (ТЗ §4, §5.1, §5.11).
 * Видны только опубликованные, не удалённые записи с наступившей датой публикации.
 * Документы для главной берутся только из public_documents_v и только с эффективным уровнем open.
 */

const PUBLIC_NEWS = Prisma.sql`n.publication_status = 'published' AND n.deleted_at IS NULL
  AND n.published_at IS NOT NULL AND n.published_at <= now()`;
const PUBLIC_PUBLICATION = Prisma.sql`p.publication_status = 'published' AND p.deleted_at IS NULL
  AND p.published_at IS NOT NULL AND p.published_at <= now()`;

interface NewsRow {
  id: string;
  slug: string;
  published_at: Date;
  data_origin: string;
  source_url: string | null;
  rubric_slug: string | null;
  rubric_name: string | null;
  title: string | null;
  lead: string | null;
  body_text: string | null;
  content_lang: string | null;
  translation_status: string | null;
}

function newsSelect(lang: Locale): Prisma.Sql {
  return Prisma.sql`
    SELECT n.id, n.slug, n.published_at, n.data_origin::text AS data_origin, n.source_url,
           c.slug AS rubric_slug, ct.name AS rubric_name,
           t.title, t.lead, t.body_text, t.locale AS content_lang, t.translation_status
    FROM news n
    LEFT JOIN categories c ON c.id = n.category_id
    ${bestTranslation('category', 'ct', 'n.category_id', lang, ['name'])}
    ${bestTranslation('news', 't', 'n.id', lang, ['title', 'lead', 'body_text'])}`;
}

function newsSummary(n: NewsRow) {
  return {
    slug: n.slug,
    title: n.title,
    lead: n.lead,
    publishedAt: n.published_at.toISOString(),
    rubric: n.rubric_slug ? { slug: n.rubric_slug, name: n.rubric_name } : null,
    dataOrigin: n.data_origin,
    contentLang: n.content_lang,
    translationStatus: n.translation_status,
  };
}

interface PublicationRow {
  slug: string;
  kind: string;
  period_text: string | null;
  year_from: number | null;
  year_to: number | null;
  published_at: Date;
  data_origin: string;
  title: string | null;
  lead: string | null;
  content_lang: string | null;
  translation_status: string | null;
  topics: Array<{ slug: string; name: string | null }>;
}

interface HomeDocumentRow {
  id: string;
  fond_number: string;
  inventory_number: string;
  case_number: string;
  sheets_from: string | null;
  sheets_to: string | null;
  date_from: Date | null;
  date_to: Date | null;
  date_precision: string;
  online_copy: boolean;
  data_origin: string;
  title: string | null;
  content_lang: string | null;
  translation_status: string | null;
}

export async function contentRoutes(app: FastifyInstance, opts: { db: PrismaClient }): Promise<void> {
  const { db } = opts;

  app.get('/news', async (request, reply) => {
    const query = newsListSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const conds = [PUBLIC_NEWS];
    if (query.rubric) conds.push(Prisma.sql`c.kind = 'news_rubric' AND c.slug = ${query.rubric}`);
    const where = and(conds);
    const offset = (query.page - 1) * query.pageSize;
    const [countRows, rows] = await Promise.all([
      db.$queryRaw<Array<{ total: bigint }>>`
        SELECT count(*) AS total FROM news n LEFT JOIN categories c ON c.id = n.category_id ${where}`,
      db.$queryRaw<NewsRow[]>`${newsSelect(lang)} ${where}
        ORDER BY n.published_at DESC, n.slug LIMIT ${query.pageSize} OFFSET ${offset}`,
    ]);
    return pageOf(rows.map(newsSummary), Number(countRows[0]?.total ?? 0), query.page, query.pageSize);
  });

  app.get('/news/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string().max(200) }).parse(request.params);
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [n] = await db.$queryRaw<NewsRow[]>`${newsSelect(lang)} WHERE ${PUBLIC_NEWS} AND n.slug = ${slug}`;
    if (!n) throw notFound();
    return { ...newsSummary(n), bodyText: n.body_text, sourceUrl: n.source_url };
  });

  /**
   * Агрегат главной (docs/api-design.md: GET /home): последние новости, «История в документах»
   * (направления, публикации и открытые документы). Один запрос вместо нескольких.
   */
  app.get('/home', async (request, reply) => {
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [news, publications, topics, documents] = await Promise.all([
      db.$queryRaw<NewsRow[]>`${newsSelect(lang)} WHERE ${PUBLIC_NEWS} ORDER BY n.published_at DESC, n.slug LIMIT 3`,
      db.$queryRaw<PublicationRow[]>`
        SELECT p.slug, p.kind::text AS kind, p.period_text, p.year_from, p.year_to, p.published_at,
               p.data_origin::text AS data_origin, t.title, t.lead, t.locale AS content_lang, t.translation_status,
               coalesce((
                 SELECT json_agg(json_build_object('slug', c.slug, 'name', ct.name) ORDER BY c.sort_order)
                 FROM publication_categories pc
                 JOIN categories c ON c.id = pc.category_id AND c.kind = 'history_topic'
                 ${bestTranslation('category', 'ct', 'c.id', lang, ['name'])}
                 WHERE pc.publication_id = p.id
               ), '[]'::json) AS topics
        FROM publications p
        ${bestTranslation('publication', 't', 'p.id', lang, ['title', 'lead'])}
        WHERE ${PUBLIC_PUBLICATION}
        ORDER BY p.is_featured DESC, p.published_at DESC, p.slug
        LIMIT 3`,
      db.$queryRaw<Array<{ slug: string; name: string | null; publication_count: bigint }>>`
        SELECT c.slug, ct.name,
               (SELECT count(*) FROM publication_categories pc JOIN publications p ON p.id = pc.publication_id
                WHERE pc.category_id = c.id AND ${PUBLIC_PUBLICATION}) AS publication_count
        FROM categories c ${bestTranslation('category', 'ct', 'c.id', lang, ['name'])}
        WHERE c.kind = 'history_topic'
        ORDER BY c.sort_order`,
      db.$queryRaw<HomeDocumentRow[]>`
        SELECT d.id, d.fond_number, d.inventory_number, d.case_number, d.sheets_from, d.sheets_to,
               d.date_from, d.date_to, d.date_precision::text AS date_precision, d.data_origin::text AS data_origin,
               EXISTS (SELECT 1 FROM public_document_pages_v pg WHERE pg.document_id = d.id) AS online_copy,
               t.title, t.locale AS content_lang, t.translation_status
        FROM public_documents_v d
        ${bestTranslation('document', 't', 'd.id', lang, ['title'])}
        WHERE d.effective_access = 'open'
        ORDER BY d.is_featured DESC, d.has_digital_copy DESC, d.updated_at DESC, d.id
        LIMIT 4`,
    ]);

    return {
      news: news.map(newsSummary),
      history: {
        topics: topics.map((t) => ({ slug: t.slug, name: t.name, publicationCount: Number(t.publication_count) })),
        publications: publications.map((p) => ({
          slug: p.slug,
          kind: p.kind,
          title: p.title,
          lead: p.lead,
          periodText: p.period_text,
          yearFrom: p.year_from,
          yearTo: p.year_to,
          publishedAt: p.published_at.toISOString(),
          topics: p.topics,
          dataOrigin: p.data_origin,
          contentLang: p.content_lang,
          translationStatus: p.translation_status,
        })),
        documents: documents.map((d) => ({
          id: d.id,
          title: d.title,
          archiveCode: archiveCodeDto(d, lang),
          date: dateDto(d),
          hasDigitalCopy: d.online_copy,
          dataOrigin: d.data_origin,
          contentLang: d.content_lang,
          translationStatus: d.translation_status,
        })),
      },
    };
  });
}
