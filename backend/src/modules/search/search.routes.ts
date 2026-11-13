import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { documentSearchSchema, parseArchiveCode, siteSearchSchema, type Locale } from '@archive-vko/shared';
import { resolveLang } from '../../http/lang.ts';
import { bestTranslation, likePattern, translationTable, type TranslationTable } from '../../infrastructure/database/sql.ts';
import { logSearchQuery } from '../analytics/analytics.ts';
import { CatalogRepository } from '../catalog/catalog.repository.ts';
import { INFO_PAGE_KEYS } from '../content/site.routes.ts';

/**
 * Поиск по сайту из шапки (F-007, аудит Р3). Ищет по разделам, новостям, публикациям, выставкам,
 * филиалам и вопросам с ответами и группирует результат по типу. Архивный учёт здесь не ищется:
 * если запрос похож на шифр или находится в каталоге, ответ содержит catalogHint со ссылкой в каталог.
 * Видны только опубликованные, не удалённые записи; текст ищется во всех языковых версиях.
 */

export const SITE_SEARCH_GROUPS = ['pages', 'news', 'publications', 'exhibitions', 'branches', 'faq'] as const;
type Group = (typeof SITE_SEARCH_GROUPS)[number];

const PER_GROUP = 5;

interface Row {
  key: string;
  title: string | null;
  text: string | null;
  date: Date | null;
  topic: string | null;
  title_hit: boolean;
  total: bigint;
}

interface GroupSpec {
  /** Таблица записей с псевдонимом r и условием видимости. */
  from: Prisma.Sql;
  visible: Prisma.Sql;
  /** Таблица переводов: текст ищется во всех языковых версиях. */
  translations: TranslationTable;
  /** Поля перевода, по которым ищется текст; первое — заголовок. */
  fields: readonly string[];
  /** Ключ для адреса: slug или key. */
  key: Prisma.Sql;
  date: Prisma.Sql;
  topic?: Prisma.Sql;
  /** Поле перевода с текстом для отрывка. */
  textField: string;
  order: Prisma.Sql;
}

const PAGE_KEYS = [...INFO_PAGE_KEYS, 'anticorruption'];

const SPECS: Record<Group, GroupSpec> = {
  pages: {
    from: Prisma.sql`pages r`,
    visible: Prisma.sql`r.publication_status = 'published' AND r.deleted_at IS NULL
      AND (r.key = ANY(${PAGE_KEYS}) OR r.key LIKE 'about/%')`,
    translations: 'page', fields: ['title', 'lead', 'body_text', 'seo_keywords'],
    key: Prisma.sql`r.key`, date: Prisma.sql`NULL::timestamptz`, textField: 'body_text', order: Prisma.sql`r.sort_order, r.key`,
  },
  news: {
    from: Prisma.sql`news r`,
    visible: Prisma.sql`r.publication_status = 'published' AND r.deleted_at IS NULL AND r.published_at IS NOT NULL AND r.published_at <= now()`,
    translations: 'news', fields: ['title', 'lead', 'body_text', 'seo_keywords'],
    key: Prisma.sql`r.slug`, date: Prisma.sql`r.published_at`, textField: 'body_text', order: Prisma.sql`r.published_at DESC, r.slug`,
  },
  publications: {
    from: Prisma.sql`publications r`,
    visible: Prisma.sql`r.publication_status = 'published' AND r.deleted_at IS NULL AND r.published_at IS NOT NULL AND r.published_at <= now()`,
    translations: 'publication', fields: ['title', 'lead', 'body_text', 'seo_keywords'],
    key: Prisma.sql`r.slug`, date: Prisma.sql`r.published_at`, textField: 'body_text', order: Prisma.sql`r.published_at DESC, r.slug`,
  },
  exhibitions: {
    from: Prisma.sql`public_exhibitions_v r`,
    visible: Prisma.sql`true`,
    translations: 'exhibition', fields: ['title', 'lead', 'description'],
    key: Prisma.sql`r.slug`, date: Prisma.sql`r.opens_at::timestamptz`, textField: 'description', order: Prisma.sql`r.opens_at DESC NULLS LAST, r.slug`,
  },
  branches: {
    from: Prisma.sql`branches r`,
    visible: Prisma.sql`r.publication_status = 'published' AND r.deleted_at IS NULL`,
    translations: 'branch', fields: ['full_name', 'short_name', 'address', 'description', 'competence', 'service_area'],
    key: Prisma.sql`r.slug`, date: Prisma.sql`NULL::timestamptz`, textField: 'address', order: Prisma.sql`r.sort_order, r.slug`,
  },
  faq: {
    from: Prisma.sql`faq_items r`,
    visible: Prisma.sql`r.publication_status = 'published'`,
    translations: 'faqItem', fields: ['question', 'answer'],
    key: Prisma.sql`r.id::text`, date: Prisma.sql`NULL::timestamptz`, topic: Prisma.sql`r.topic`, textField: 'answer', order: Prisma.sql`r.sort_order`,
  },
};

/** Слова запроса: до шести, короче двух букв отбрасываются (если остаётся хоть одно). */
export function queryWords(q: string): string[] {
  const all = q.toLowerCase().split(/[\s,;:!?«»"()]+/u).map((w) => w.replace(/^[.-]+|[.-]+$/gu, '')).filter(Boolean);
  const long = all.filter((w) => w.length >= 2);
  return (long.length ? long : all).slice(0, 6);
}

/** Отрывок текста вокруг первого найденного слова, около 200 символов. */
export function snippet(text: string | null, words: readonly string[]): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/gu, ' ').trim();
  if (!flat) return null;
  const lower = flat.toLowerCase();
  const hit = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, hit - 60);
  const cut = flat.slice(start, start + 200);
  return `${start > 0 ? '…' : ''}${cut}${start + 200 < flat.length ? '…' : ''}`;
}

function groupQuery(spec: GroupSpec, words: readonly string[], lang: Locale): Prisma.Sql {
  const [tableName, fkName] = translationTable(spec.translations);
  const table = Prisma.raw(tableName);
  const fk = Prisma.raw(fkName);
  const haystack = Prisma.raw(`concat_ws(' ', ${spec.fields.map((f) => `x.${f}`).join(', ')})`);
  const every = Prisma.join(words.map((w) => Prisma.sql`${haystack} ILIKE ${likePattern(w)} ESCAPE '\\'`), ' AND ');
  const titleField = Prisma.raw(`t.${spec.fields[0]!}`);
  const titleHit = Prisma.join(words.map((w) => Prisma.sql`${titleField} ILIKE ${likePattern(w)} ESCAPE '\\'`), ' AND ');
  return Prisma.sql`
    SELECT ${spec.key} AS key, ${titleField} AS title, ${Prisma.raw(`t.${spec.textField}`)} AS text, ${spec.date} AS date,
           ${spec.topic ?? Prisma.sql`NULL::text`} AS topic, coalesce(${titleHit}, false) AS title_hit, count(*) OVER () AS total
    FROM ${spec.from}
    ${bestTranslation(spec.translations, 't', 'r.id', lang, [spec.fields[0]!, spec.textField])}
    WHERE ${spec.visible}
      AND EXISTS (SELECT 1 FROM ${table} x WHERE x.${fk} = r.id AND x.translation_status <> 'missing' AND ${every})
    ORDER BY title_hit DESC, ${spec.order}
    LIMIT ${PER_GROUP}`;
}

const pathOf = (group: Group, row: Row): string => {
  switch (group) {
    case 'pages': return row.key.startsWith('about/') ? '/about' : `/${row.key}`;
    case 'news': return `/news/${row.key}`;
    case 'publications': return `/history/${row.key}`;
    case 'exhibitions': return `/exhibitions/${row.key}`;
    case 'branches': return `/branches/${row.key}`;
    case 'faq': return `/faq#faq-${row.topic ?? 'site'}`;
  }
};

export async function searchRoutes(app: FastifyInstance, opts: { db: PrismaClient }): Promise<void> {
  const { db } = opts;
  const catalog = new CatalogRepository(db);

  app.get('/search', async (request, reply) => {
    const query = siteSearchSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const code = parseArchiveCode(query.q);
    // Шифр ищется только в каталоге: по разделам сайта «Ф. 1» нашёл бы всё, где есть буква и цифра.
    const words = code ? [] : queryWords(query.q);

    const [groupRows, catalogResult] = await Promise.all([
      words.length
        ? Promise.all(SITE_SEARCH_GROUPS.map((g) => db.$queryRaw<Row[]>(groupQuery(SPECS[g], words, lang))))
        : Promise.resolve(SITE_SEARCH_GROUPS.map((): Row[] => [])),
      catalog.searchDocuments(documentSearchSchema.parse({ q: query.q, pageSize: 1 }), lang),
    ]);

    const groups = SITE_SEARCH_GROUPS.map((type, i) => {
      const rows = groupRows[i] ?? [];
      return {
        type,
        total: Number(rows[0]?.total ?? 0),
        items: rows.map((r) => ({
          title: r.title ?? '',
          path: pathOf(type, r),
          excerpt: snippet(r.text, words),
          date: r.date ? r.date.toISOString().slice(0, 10) : null,
        })),
      };
    }).filter((g) => g.total > 0);

    const total = groups.reduce((n, g) => n + g.total, 0);
    const catalogCount = catalogResult.total;
    await logSearchQuery(db, request, { text: query.q, locale: lang, source: 'site', resultCount: total, filters: { catalog: catalogCount } });

    return {
      query: query.q,
      total,
      groups,
      // Подсказка перейти в каталог: запрос похож на шифр или что-то нашлось в учёте.
      catalogHint: code || catalogCount > 0
        ? { count: catalogCount, looksLikeCode: code !== null, path: `/catalog?${new URLSearchParams({ q: query.q }).toString()}` }
        : null,
    };
  });
}
