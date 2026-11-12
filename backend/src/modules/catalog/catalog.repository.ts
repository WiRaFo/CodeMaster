import { Prisma, type PrismaClient } from '@prisma/client';
import { parseArchiveCode, type ArchiveCode, type DocumentFilters, type DocumentSearchQuery, type Locale } from '@archive-vko/shared';
import { and, bestTranslation, likePattern } from '../../infrastructure/database/sql.ts';
import { HL_START, HL_STOP } from '../../http/highlight.ts';

/**
 * Запросы публичного каталога. Все чтения идут только через представления public_*_v
 * (миграции access_search и public_hierarchy_views): закрытые записи, неопубликованные
 * записи и записи с закрытым или неопубликованным предком в них отсутствуют.
 * Для ограниченных документов поиск не учитывает вес D (расшифровка и SEO-слова),
 * а расшифровка не читается вовсе.
 */

/** Порог сходства для неточного поиска по названию (pg_trgm word_similarity). */
const TRIGRAM_THRESHOLD = 0.5;

export interface DocumentRow {
  id: string;
  fond_number: string;
  inventory_number: string;
  case_number: string;
  document_number: string | null;
  sheets_from: string | null;
  sheets_to: string | null;
  date_from: Date | null;
  date_to: Date | null;
  date_precision: string;
  effective_access: 'open' | 'restricted';
  data_origin: string;
  content_lang: string | null;
  translation_status: string | null;
  title: string | null;
  type_code: string;
  type_name: string | null;
  branch_id: string;
  branch_slug: string;
  branch_name: string | null;
  online_copy: boolean;
  highlight: string | null;
}

interface SearchPlan {
  /** Текст для полнотекстового и неточного поиска; null, если запрос распознан как шифр. */
  text: string | null;
  code: ArchiveCode | null;
}

export function planSearch(filters: DocumentFilters): SearchPlan {
  if (!filters.q) return { text: null, code: null };
  const code = parseArchiveCode(filters.q);
  return code ? { text: null, code } : { text: filters.q, code: null };
}

function textMatchJoin(text: string | null): Prisma.Sql {
  if (text === null) return Prisma.empty;
  return Prisma.sql`LEFT JOIN LATERAL (
    SELECT bool_or(v.vec @@ v.query) AS fts_hit,
           max(ts_rank_cd(v.vec, v.query)) AS rank,
           max(word_similarity(${text}, t.title)) AS sim
    FROM document_translations t
    CROSS JOIN LATERAL (
      SELECT CASE WHEN p.effective_access = 'open' THEN t.search_vector
                  ELSE ts_filter(t.search_vector, '{a,b,c}') END AS vec,
             plainto_tsquery(archive_search_config(t.locale), ${text}) AS query
    ) v
    WHERE t.document_id = p.id AND t.translation_status <> 'missing'
  ) m ON true`;
}

function documentConditions(f: DocumentFilters, plan: SearchPlan): Prisma.Sql[] {
  const c: Prisma.Sql[] = [];
  const fond = f.fond ?? plan.code?.fond;
  const inventory = f.inventory ?? plan.code?.inventory;
  const kase = f.case ?? plan.code?.case;
  if (fond) c.push(Prisma.sql`upper(p.fond_number) = upper(${fond})`);
  if (inventory) c.push(Prisma.sql`upper(p.inventory_number) = upper(${inventory})`);
  if (kase) c.push(Prisma.sql`upper(p.case_number) = upper(${kase})`);
  if (plan.text !== null) c.push(Prisma.sql`(m.fts_hit OR m.sim >= ${TRIGRAM_THRESHOLD})`);
  if (f.branch) c.push(Prisma.sql`p.branch_id IN (SELECT id FROM branches WHERE slug = ANY(${f.branch}) OR id::text = ANY(${f.branch}))`);
  if (f.period) c.push(Prisma.sql`p.period_id IN (SELECT id FROM historical_periods WHERE slug = ANY(${f.period}))`);
  if (f.type) c.push(Prisma.sql`p.document_type_id IN (SELECT id FROM document_types WHERE code = ANY(${f.type}))`);
  if (f.settlement) {
    c.push(Prisma.sql`EXISTS (SELECT 1 FROM document_settlements ds JOIN settlements s ON s.id = ds.settlement_id
                              WHERE ds.document_id = p.id AND s.slug = ANY(${f.settlement}))`);
  }
  if (f.topic) {
    c.push(Prisma.sql`EXISTS (SELECT 1 FROM document_categories dc JOIN categories cat ON cat.id = dc.category_id
                              WHERE dc.document_id = p.id AND cat.slug = ANY(${f.topic}))`);
  }
  if (f.organization) c.push(Prisma.sql`p.organization_id::text = ANY(${f.organization})`);
  if (f.author) c.push(Prisma.sql`p.author_text ILIKE ${likePattern(f.author)} ESCAPE '\\'`);
  // Пересечение периода документа [date_from, date_to] с запрошенными годами.
  if (f.yearFrom !== undefined) c.push(Prisma.sql`coalesce(p.date_to, p.date_from) >= make_date(${f.yearFrom}::int, 1, 1)`);
  if (f.yearTo !== undefined) c.push(Prisma.sql`coalesce(p.date_from, p.date_to) <= make_date(${f.yearTo}::int, 12, 31)`);
  if (f.hasDigitalCopy !== undefined) {
    c.push(Prisma.sql`EXISTS (SELECT 1 FROM public_document_pages_v pg WHERE pg.document_id = p.id) = ${f.hasDigitalCopy}`);
  }
  if (f.access) c.push(Prisma.sql`p.effective_access::text = ANY(${f.access})`);
  return c;
}

function orderBy(sort: DocumentSearchQuery['sort'], plan: SearchPlan): Prisma.Sql {
  const byCode = Prisma.sql`p.fond_number, p.inventory_number, length(p.case_number), p.case_number, length(coalesce(p.document_number, '')), p.document_number`;
  switch (sort) {
    case 'date_asc':
      return Prisma.sql`ORDER BY p.date_from ASC NULLS LAST, p.id`;
    case 'date_desc':
      return Prisma.sql`ORDER BY p.date_from DESC NULLS LAST, p.id`;
    case 'code':
      return Prisma.sql`ORDER BY ${byCode}, p.id`;
    case 'relevance':
      return plan.text !== null
        ? Prisma.sql`ORDER BY m.fts_hit DESC NULLS LAST, m.rank DESC NULLS LAST, m.sim DESC NULLS LAST, p.id`
        : Prisma.sql`ORDER BY ${byCode}, p.id`;
  }
}

export class CatalogRepository {
  constructor(private readonly db: PrismaClient) {}

  /** caseId — внутренний фильтр для списка документов дела; из query не принимается. */
  async searchDocuments(
    query: DocumentSearchQuery,
    lang: Locale,
    caseId?: string,
  ): Promise<{ rows: DocumentRow[]; total: number; plan: SearchPlan }> {
    const plan = planSearch(query);
    const conditions = documentConditions(query, plan);
    if (caseId) conditions.push(Prisma.sql`p.case_id = ${caseId}::uuid`);
    const where = and(conditions);
    const match = textMatchJoin(plan.text);
    // Подсветка по описанию, а если в нём нет совпадений — по названию. Только разрешённые поля перевода.
    // Название короткое и выводится целиком (HighlightAll), описание — фрагментом.
    const headline = (field: 'tr.description' | 'tr.title') =>
      Prisma.sql`ts_headline(archive_search_config(tr.locale::"Locale"), ${Prisma.raw(field)},
             plainto_tsquery(archive_search_config(tr.locale::"Locale"), ${plan.text}),
             ${`StartSel=${HL_START}, StopSel=${HL_STOP}, ${field === 'tr.title' ? 'HighlightAll=true' : 'MaxFragments=1, MaxWords=30, MinWords=10'}`})`;
    const highlight =
      plan.text !== null
        ? Prisma.sql`CASE WHEN tr.description IS NOT NULL AND position(${HL_START} IN ${headline('tr.description')}) > 0
                          THEN ${headline('tr.description')} ELSE ${headline('tr.title')} END`
        : Prisma.sql`NULL::text`;

    const [countRow] = await this.db.$queryRaw<Array<{ total: bigint }>>`
      SELECT count(*) AS total FROM public_documents_v p ${match} ${where}`;
    const rows = await this.db.$queryRaw<DocumentRow[]>`
      SELECT p.id, p.fond_number, p.inventory_number, p.case_number, p.document_number,
             p.sheets_from, p.sheets_to, p.date_from, p.date_to, p.date_precision::text AS date_precision,
             p.effective_access::text AS effective_access, p.data_origin::text AS data_origin,
             tr.locale AS content_lang, tr.translation_status, tr.title,
             dty.code AS type_code, dtt.name AS type_name,
             p.branch_id, b.slug AS branch_slug, coalesce(bt.short_name, bt.full_name) AS branch_name,
             EXISTS (SELECT 1 FROM public_document_pages_v pg WHERE pg.document_id = p.id) AS online_copy,
             ${highlight} AS highlight
      FROM public_documents_v p
      ${match}
      ${bestTranslation('document', 'tr', 'p.id', lang, ['title', 'description'])}
      JOIN document_types dty ON dty.id = p.document_type_id
      ${bestTranslation('documentType', 'dtt', 'p.document_type_id', lang, ['name'])}
      JOIN branches b ON b.id = p.branch_id
      ${bestTranslation('branch', 'bt', 'p.branch_id', lang, ['full_name', 'short_name'])}
      ${where}
      ${orderBy(query.sort, plan)}
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
    return { rows, total: Number(countRow?.total ?? 0), plan };
  }

  /**
   * Фасеты выдачи (F-031). Счётчик каждого фасета считается по выдаче со всеми фильтрами, кроме его собственного
   * (дизъюнктивные фасеты): выбранный тип не обнуляет остальные типы, а показывает, сколько документов добавит выбор.
   * Все счётчики — только по public_documents_v, закрытые документы в них не входят.
   */
  async facets(filters: DocumentFilters, lang: Locale) {
    const plan = planSearch(filters);
    const base = (without: keyof DocumentFilters) => {
      const f: DocumentFilters = { ...filters, [without]: undefined };
      return Prisma.sql`SELECT p.id, p.document_type_id, p.period_id, p.branch_id, p.effective_access,
          EXISTS (SELECT 1 FROM public_document_pages_v pg WHERE pg.document_id = p.id) AS online_copy
        FROM public_documents_v p ${textMatchJoin(plan.text)} ${and(documentConditions(f, plan))}`;
    };
    type Row = { key: string; name: string | null; count: bigint };
    const [types, periods, branches, settlements, topics, access, copies] = await Promise.all([
      this.db.$queryRaw<Row[]>`
        WITH f AS (${base('type')}) SELECT dty.code AS key, n.name, count(*) AS count FROM f
        JOIN document_types dty ON dty.id = f.document_type_id
        ${bestTranslation('documentType', 'n', 'f.document_type_id', lang, ['name'])}
        GROUP BY dty.code, n.name, dty.sort_order ORDER BY dty.sort_order`,
      this.db.$queryRaw<Row[]>`
        WITH f AS (${base('period')}) SELECT hp.slug AS key, n.name, count(*) AS count FROM f
        JOIN historical_periods hp ON hp.id = f.period_id
        ${bestTranslation('period', 'n', 'f.period_id', lang, ['name'])}
        GROUP BY hp.slug, n.name, hp.sort_order ORDER BY hp.sort_order`,
      this.db.$queryRaw<Row[]>`
        WITH f AS (${base('branch')}) SELECT b.slug AS key, coalesce(n.short_name, n.full_name) AS name, count(*) AS count FROM f
        JOIN branches b ON b.id = f.branch_id
        ${bestTranslation('branch', 'n', 'f.branch_id', lang, ['full_name', 'short_name'])}
        GROUP BY b.slug, n.short_name, n.full_name, b.sort_order ORDER BY b.sort_order`,
      this.db.$queryRaw<Row[]>`
        WITH f AS (${base('settlement')}) SELECT s.slug AS key, n.name, count(DISTINCT f.id) AS count FROM f
        JOIN document_settlements ds ON ds.document_id = f.id
        JOIN settlements s ON s.id = ds.settlement_id
        ${bestTranslation('settlement', 'n', 's.id', lang, ['name'])}
        GROUP BY s.slug, n.name ORDER BY n.name`,
      this.db.$queryRaw<Row[]>`
        WITH f AS (${base('topic')}) SELECT c.slug AS key, n.name, count(DISTINCT f.id) AS count FROM f
        JOIN document_categories dc ON dc.document_id = f.id
        JOIN categories c ON c.id = dc.category_id AND c.kind IN ('catalog_topic', 'history_topic')
        ${bestTranslation('category', 'n', 'c.id', lang, ['name'])}
        GROUP BY c.slug, n.name, c.kind, c.sort_order ORDER BY c.kind, c.sort_order`,
      this.db.$queryRaw<Array<{ key: string; count: bigint }>>`
        WITH f AS (${base('access')}) SELECT effective_access::text AS key, count(*) AS count FROM f GROUP BY 1 ORDER BY 1`,
      this.db.$queryRaw<Array<{ key: boolean; count: bigint }>>`
        WITH f AS (${base('hasDigitalCopy')}) SELECT online_copy AS key, count(*) AS count FROM f GROUP BY 1`,
    ]);
    return { types, periods, branches, settlements, topics, access, copies };
  }

  async findDocument(id: string, lang: Locale) {
    const [row] = await this.db.$queryRaw<
      Array<
        DocumentRow & {
          case_id: string;
          inventory_id: string;
          fond_id: string;
          sheet_count: number | null;
          storage_location: string | null;
          original_languages: string[];
          author_text: string | null;
          source_note: string | null;
          updated_at: Date;
          description: string | null;
          historical_note: string | null;
          access_conditions: string | null;
          period_slug: string | null;
          period_name: string | null;
          organization_id: string | null;
          organization_name: string | null;
          fond_title: string | null;
          inventory_title: string | null;
          case_title: string | null;
          available_languages: string[];
        }
      >
    >`
      SELECT p.id, p.case_id, p.inventory_id, p.fond_id,
             p.fond_number, p.inventory_number, p.case_number, p.document_number,
             p.sheets_from, p.sheets_to, p.sheet_count, p.storage_location,
             p.date_from, p.date_to, p.date_precision::text AS date_precision,
             p.original_languages, p.author_text, p.source_note, p.updated_at,
             p.effective_access::text AS effective_access, p.data_origin::text AS data_origin,
             tr.locale AS content_lang, tr.translation_status, tr.title, tr.description, tr.historical_note,
             tr.access_conditions,
             dty.code AS type_code, dtt.name AS type_name,
             hp.slug AS period_slug, hpt.name AS period_name,
             p.organization_id, ot.name AS organization_name,
             p.branch_id, b.slug AS branch_slug, coalesce(bt.short_name, bt.full_name) AS branch_name,
             ft.title AS fond_title, it.title AS inventory_title, ct.title AS case_title,
             EXISTS (SELECT 1 FROM public_document_pages_v pg WHERE pg.document_id = p.id) AS online_copy,
             NULL::text AS highlight,
             ARRAY(SELECT t.locale::text FROM document_translations t
                   WHERE t.document_id = p.id AND t.translation_status <> 'missing' ORDER BY t.locale) AS available_languages
      FROM public_documents_v p
      ${bestTranslation('document', 'tr', 'p.id', lang, ['title', 'description', 'historical_note', 'access_conditions'])}
      JOIN document_types dty ON dty.id = p.document_type_id
      ${bestTranslation('documentType', 'dtt', 'p.document_type_id', lang, ['name'])}
      LEFT JOIN historical_periods hp ON hp.id = p.period_id
      ${bestTranslation('period', 'hpt', 'p.period_id', lang, ['name'])}
      ${bestTranslation('organization', 'ot', 'p.organization_id', lang, ['name'])}
      JOIN branches b ON b.id = p.branch_id
      ${bestTranslation('branch', 'bt', 'p.branch_id', lang, ['full_name', 'short_name'])}
      ${bestTranslation('fond', 'ft', 'p.fond_id', lang, ['title'])}
      ${bestTranslation('inventory', 'it', 'p.inventory_id', lang, ['title'])}
      ${bestTranslation('case', 'ct', 'p.case_id', lang, ['title'])}
      WHERE p.id = ${id}::uuid`;
    if (!row) return null;

    const [settlements, topics] = await Promise.all([
      this.db.$queryRaw<Array<{ slug: string; name: string | null }>>`
        SELECT s.slug, n.name FROM document_settlements ds JOIN settlements s ON s.id = ds.settlement_id
        ${bestTranslation('settlement', 'n', 's.id', lang, ['name'])}
        WHERE ds.document_id = ${id}::uuid ORDER BY n.name`,
      this.db.$queryRaw<Array<{ slug: string; kind: string; name: string | null }>>`
        SELECT c.slug, c.kind::text AS kind, n.name FROM document_categories dc JOIN categories c ON c.id = dc.category_id
        ${bestTranslation('category', 'n', 'c.id', lang, ['name'])}
        WHERE dc.document_id = ${id}::uuid ORDER BY c.sort_order`,
    ]);
    return { row, settlements, topics };
  }

  /** Расшифровка читается только для эффективно открытых документов. */
  async findTranscription(id: string, locale: string): Promise<string | null> {
    const [row] = await this.db.$queryRaw<Array<{ transcription: string | null }>>`
      SELECT t.transcription FROM document_translations t
      JOIN public_documents_v p ON p.id = t.document_id AND p.effective_access = 'open'
      WHERE t.document_id = ${id}::uuid AND t.locale = ${locale}::"Locale"`;
    return row?.transcription ?? null;
  }

  /** Файл страницы для показа; только через public_document_pages_v. */
  async findPageFile(documentId: string, pageNumber: number) {
    const [row] = await this.db.$queryRaw<Array<{ asset_id: string; storage_bucket: string; storage_key: string; mime_type: string }>>`
      SELECT a.id AS asset_id, a.storage_bucket, a.storage_key, a.mime_type
      FROM public_document_pages_v pg JOIN digital_assets a ON a.id = pg.asset_id
      WHERE pg.document_id = ${documentId}::uuid AND pg.page_number = ${pageNumber}
      LIMIT 1`;
    return row ?? null;
  }

  async findPages(documentId: string, lang: Locale) {
    const pages = await this.db.$queryRaw<
      Array<{
        page_number: number;
        sheet_label: string | null;
        asset_id: string;
        kind: string;
        mime_type: string;
        width: number | null;
        height: number | null;
        has_text_layer: boolean;
        download_allowed: boolean;
        alt_text: string | null;
        alt_lang: string | null;
      }>
    >`
      SELECT pg.page_number, pg.sheet_label, pg.asset_id, pg.kind::text AS kind, pg.mime_type, pg.width, pg.height,
             pg.has_text_layer, pg.download_allowed, at.alt_text, at.locale AS alt_lang
      FROM public_document_pages_v pg
      LEFT JOIN LATERAL (
        SELECT t.alt_text, t.locale::text AS locale FROM asset_translations t
        WHERE t.asset_id = pg.asset_id AND t.translation_status <> 'missing'
        ORDER BY (t.locale = ${lang}::"Locale") DESC, (t.locale = 'ru') DESC, t.locale LIMIT 1
      ) at ON true
      WHERE pg.document_id = ${documentId}::uuid
      ORDER BY pg.page_number`;
    const assetIds = pages.map((p) => p.asset_id);
    const derivatives = assetIds.length
      ? await this.db.assetDerivative.findMany({
          where: { assetId: { in: assetIds } },
          select: { assetId: true, variant: true, format: true, width: true, height: true },
          orderBy: [{ variant: 'asc' }],
        })
      : [];
    return { pages, derivatives };
  }

  async accessOf(documentId: string): Promise<'open' | 'restricted' | null> {
    const [row] = await this.db.$queryRaw<Array<{ a: 'open' | 'restricted' }>>`
      SELECT effective_access::text AS a FROM public_documents_v WHERE id = ${documentId}::uuid`;
    return row?.a ?? null;
  }

  async listFonds(branch: string[] | undefined, q: string | undefined, page: number, pageSize: number, lang: Locale) {
    const conds: Prisma.Sql[] = [];
    if (branch) conds.push(Prisma.sql`f.branch_id IN (SELECT id FROM branches WHERE slug = ANY(${branch}) OR id::text = ANY(${branch}))`);
    if (q) {
      conds.push(Prisma.sql`(upper(f.fond_number) = upper(${q})
        OR EXISTS (SELECT 1 FROM fond_translations t WHERE t.fond_id = f.id AND t.translation_status <> 'missing'
                   AND (t.title ILIKE ${likePattern(q)} ESCAPE '\\' OR word_similarity(${q}, t.title) >= ${TRIGRAM_THRESHOLD})))`);
    }
    const where = and(conds);
    const [countRow] = await this.db.$queryRaw<Array<{ total: bigint }>>`SELECT count(*) AS total FROM public_fonds_v f ${where}`;
    const rows = await this.db.$queryRaw<FondRow[]>`
      ${fondSelect(lang)} ${where}
      ORDER BY f.fond_number_sort NULLS LAST, f.fond_number
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return { rows, total: Number(countRow?.total ?? 0) };
  }

  async findFond(id: string, lang: Locale) {
    const [fond] = await this.db.$queryRaw<FondRow[]>`${fondSelect(lang)} WHERE f.id = ${id}::uuid`;
    if (!fond) return null;
    const inventories = await this.db.$queryRaw<
      Array<{ id: string; inventory_number: string; year_from: number | null; year_to: number | null; effective_access: string; title: string | null; content_lang: string | null }>
    >`
      SELECT i.id, i.inventory_number, i.year_from, i.year_to, i.effective_access::text AS effective_access, t.title, t.locale AS content_lang
      FROM public_inventories_v i
      ${bestTranslation('inventory', 't', 'i.id', lang, ['title'])}
      WHERE i.fond_id = ${id}::uuid
      ORDER BY length(i.inventory_number), i.inventory_number`;
    return { fond, inventories };
  }

  async findInventory(id: string, lang: Locale) {
    const [inventory] = await this.db.$queryRaw<
      Array<{
        id: string;
        fond_id: string;
        fond_number: string;
        inventory_number: string;
        year_from: number | null;
        year_to: number | null;
        effective_access: string;
        data_origin: string;
        title: string | null;
        annotation: string | null;
        content_lang: string | null;
        translation_status: string | null;
        fond_title: string | null;
      }>
    >`
      SELECT i.id, i.fond_id, i.fond_number, i.inventory_number, i.year_from, i.year_to,
             i.effective_access::text AS effective_access, i.data_origin::text AS data_origin,
             t.title, t.annotation, t.locale AS content_lang, t.translation_status, ft.title AS fond_title
      FROM public_inventories_v i
      ${bestTranslation('inventory', 't', 'i.id', lang, ['title', 'annotation'])}
      ${bestTranslation('fond', 'ft', 'i.fond_id', lang, ['title'])}
      WHERE i.id = ${id}::uuid`;
    if (!inventory) return null;
    const cases = await this.db.$queryRaw<
      Array<{ id: string; case_number: string; date_from: Date | null; date_to: Date | null; date_precision: string; sheet_count: number | null; effective_access: string; title: string | null; content_lang: string | null }>
    >`
      SELECT c.id, c.case_number, c.date_from, c.date_to, c.date_precision::text AS date_precision, c.sheet_count,
             c.effective_access::text AS effective_access, t.title, t.locale AS content_lang
      FROM public_cases_v c
      ${bestTranslation('case', 't', 'c.id', lang, ['title'])}
      WHERE c.inventory_id = ${id}::uuid
      ORDER BY length(c.case_number), c.case_number`;
    return { inventory, cases };
  }

  async findCase(id: string, lang: Locale) {
    const [kase] = await this.db.$queryRaw<
      Array<{
        id: string;
        inventory_id: string;
        fond_id: string;
        fond_number: string;
        inventory_number: string;
        case_number: string;
        date_from: Date | null;
        date_to: Date | null;
        date_precision: string;
        sheet_count: number | null;
        storage_location: string | null;
        effective_access: string;
        data_origin: string;
        title: string | null;
        annotation: string | null;
        content_lang: string | null;
        translation_status: string | null;
        fond_title: string | null;
        inventory_title: string | null;
      }>
    >`
      SELECT c.id, c.inventory_id, c.fond_id, c.fond_number, c.inventory_number, c.case_number,
             c.date_from, c.date_to, c.date_precision::text AS date_precision, c.sheet_count, c.storage_location,
             c.effective_access::text AS effective_access, c.data_origin::text AS data_origin,
             t.title, t.annotation, t.locale AS content_lang, t.translation_status,
             ft.title AS fond_title, it.title AS inventory_title
      FROM public_cases_v c
      ${bestTranslation('case', 't', 'c.id', lang, ['title', 'annotation'])}
      ${bestTranslation('fond', 'ft', 'c.fond_id', lang, ['title'])}
      ${bestTranslation('inventory', 'it', 'c.inventory_id', lang, ['title'])}
      WHERE c.id = ${id}::uuid`;
    if (!kase) return null;
    const { rows } = await this.searchDocuments({ sort: 'code', page: 1, pageSize: 100 }, lang, id);
    return { kase, documents: rows };
  }

  async resolveCode(code: ArchiveCode, lang: Locale) {
    const fonds = await this.db.$queryRaw<Array<{ id: string; fond_number: string; branch_slug: string; branch_name: string | null; title: string | null }>>`
      SELECT f.id, f.fond_number, b.slug AS branch_slug, coalesce(bt.short_name, bt.full_name) AS branch_name, ft.title
      FROM public_fonds_v f JOIN branches b ON b.id = f.branch_id
      ${bestTranslation('branch', 'bt', 'f.branch_id', lang, ['full_name', 'short_name'])}
      ${bestTranslation('fond', 'ft', 'f.id', lang, ['title'])}
      WHERE upper(f.fond_number) = upper(${code.fond})
      ORDER BY b.sort_order`;
    const matches: Array<{ level: 'fond' | 'inventory' | 'case'; id: string; branch: { slug: string; name: string | null }; title: string | null }> = [];
    for (const f of fonds) {
      const branch = { slug: f.branch_slug, name: f.branch_name };
      if (!code.inventory) {
        matches.push({ level: 'fond', id: f.id, branch, title: f.title });
        continue;
      }
      const [inv] = await this.db.$queryRaw<Array<{ id: string; title: string | null }>>`
        SELECT i.id, t.title FROM public_inventories_v i ${bestTranslation('inventory', 't', 'i.id', lang, ['title'])}
        WHERE i.fond_id = ${f.id}::uuid AND upper(i.inventory_number) = upper(${code.inventory})`;
      if (!inv) continue;
      if (!code.case) {
        matches.push({ level: 'inventory', id: inv.id, branch, title: inv.title });
        continue;
      }
      const [kase] = await this.db.$queryRaw<Array<{ id: string; title: string | null }>>`
        SELECT c.id, t.title FROM public_cases_v c ${bestTranslation('case', 't', 'c.id', lang, ['title'])}
        WHERE c.inventory_id = ${inv.id}::uuid AND upper(c.case_number) = upper(${code.case})`;
      if (kase) matches.push({ level: 'case', id: kase.id, branch, title: kase.title });
    }
    return matches;
  }
}

export interface FondRow {
  id: string;
  fond_number: string;
  fond_kind: string;
  year_from: number | null;
  year_to: number | null;
  units_count: number | null;
  is_highlighted: boolean;
  access_level: string;
  data_origin: string;
  branch_slug: string;
  branch_name: string | null;
  title: string | null;
  annotation: string | null;
  history_note: string | null;
  content_lang: string | null;
  translation_status: string | null;
}

function fondSelect(lang: Locale): Prisma.Sql {
  return Prisma.sql`
    SELECT f.id, f.fond_number, f.fond_kind::text AS fond_kind, f.year_from, f.year_to, f.units_count, f.is_highlighted,
           f.access_level::text AS access_level, f.data_origin::text AS data_origin,
           b.slug AS branch_slug, coalesce(bt.short_name, bt.full_name) AS branch_name,
           t.title, t.annotation, t.history_note, t.locale AS content_lang, t.translation_status
    FROM public_fonds_v f
    JOIN branches b ON b.id = f.branch_id
    ${bestTranslation('branch', 'bt', 'f.branch_id', lang, ['full_name', 'short_name'])}
    ${bestTranslation('fond', 't', 'f.id', lang, ['title', 'annotation', 'history_note'])}`;
}
