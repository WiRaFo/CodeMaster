import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import { z } from 'zod';
import {
  documentFiltersSchema,
  documentSearchSchema,
  fondListSchema,
  langOnlySchema,
  parseArchiveCode,
  resolveCodeSchema,
  formatArchiveCode,
  type Locale,
} from '@archive-vko/shared';
import { ApiError, notFound } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { pageOf } from '../../http/pagination.ts';
import { CatalogRepository, type FondRow } from './catalog.repository.ts';
import { archiveCodeDto, dateDto, documentSummaryDto } from './catalog.mapper.ts';

const idParam = z.object({ id: z.string() });

/** Неверный формат id даёт тот же 404, что закрытая или отсутствующая запись. */
function uuidOr404(params: unknown): string {
  const { id } = idParam.parse(params);
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

/** Форматы изображений страниц, которые сайт отдаёт браузеру. Остальные типы не отдаются, даже если лежат в хранилище. */
const VIEWABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

export async function catalogRoutes(app: FastifyInstance, opts: { db: PrismaClient; storage: ObjectStorage }): Promise<void> {
  const repo = new CatalogRepository(opts.db);

  app.get('/catalog/documents', async (request, reply) => {
    const query = documentSearchSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const { rows, total, plan } = await repo.searchDocuments(query, lang);
    return {
      ...pageOf(
        rows.map((r) => documentSummaryDto(r, lang)),
        total,
        query.page,
        query.pageSize,
      ),
      interpretedCode: plan.code ? { ...plan.code, formatted: formatArchiveCode(plan.code, lang) } : null,
    };
  });

  app.get('/catalog/facets', async (request, reply) => {
    const filters = documentFiltersSchema.parse(request.query);
    const lang = resolveLang(request, reply, filters.lang);
    const f = await repo.facets(filters, lang);
    const n = (v: bigint) => Number(v);
    return {
      types: f.types.map((r) => ({ code: r.key, name: r.name, count: n(r.count) })),
      periods: f.periods.map((r) => ({ slug: r.key, name: r.name, count: n(r.count) })),
      branches: f.branches.map((r) => ({ slug: r.key, name: r.name, count: n(r.count) })),
      settlements: f.settlements.map((r) => ({ slug: r.key, name: r.name, count: n(r.count) })),
      topics: f.topics.map((r) => ({ slug: r.key, name: r.name, count: n(r.count) })),
      access: f.access.map((r) => ({ value: r.key, count: n(r.count) })),
      hasDigitalCopy: {
        true: n(f.copies.find((r) => r.key)?.count ?? 0n),
        false: n(f.copies.find((r) => !r.key)?.count ?? 0n),
      },
    };
  });

  app.get('/catalog/documents/:id', async (request, reply) => {
    const id = uuidOr404(request.params);
    const { lang: requested } = langOnlySchema.parse(request.query);
    const lang = resolveLang(request, reply, requested);
    const found = await repo.findDocument(id, lang);
    if (!found) throw notFound();
    const { row, settlements, topics } = found;

    const common = {
      id: row.id,
      title: row.title,
      description: row.description,
      historicalNote: row.historical_note,
      contentLang: row.content_lang,
      translationStatus: row.translation_status,
      availableLanguages: row.available_languages,
      archiveCode: archiveCodeDto(row, lang),
      documentNumber: row.document_number,
      date: dateDto(row),
      period: row.period_slug ? { slug: row.period_slug, name: row.period_name } : null,
      type: { code: row.type_code, name: row.type_name },
      originalLanguages: row.original_languages,
      sheetCount: row.sheet_count,
      author: row.author_text,
      organization: row.organization_id ? { id: row.organization_id, name: row.organization_name } : null,
      storage: { branch: { slug: row.branch_slug, name: row.branch_name }, location: row.storage_location },
      hierarchy: {
        fond: { id: row.fond_id, number: row.fond_number, title: row.fond_title },
        inventory: { id: row.inventory_id, number: row.inventory_number, title: row.inventory_title },
        case: { id: row.case_id, number: row.case_number, title: row.case_title },
      },
      settlements,
      topics,
      dataOrigin: row.data_origin,
      sourceNote: row.source_note,
      updatedAt: row.updated_at.toISOString(),
    };

    if (row.effective_access === 'restricted') {
      // Ограниченный доступ: информационная карточка с условиями доступа, без копии и расшифровки (ТЗ §5.3, с. 6).
      return {
        ...common,
        access: 'restricted' as const,
        accessConditions: row.access_conditions,
        digitalCopy: { availableOnline: false },
      };
    }
    const pageCount = row.online_copy ? (await repo.findPages(id, lang)).pages.length : 0;
    return {
      ...common,
      access: 'open' as const,
      accessConditions: null,
      digitalCopy: { availableOnline: row.online_copy, pageCount },
      transcription: row.content_lang ? await repo.findTranscription(id, row.content_lang) : null,
    };
  });

  app.get('/catalog/documents/:id/pages', async (request, reply) => {
    const id = uuidOr404(request.params);
    const { lang: requested } = langOnlySchema.parse(request.query);
    const lang = resolveLang(request, reply, requested);
    // Для ограниченного документа список страниц не существует публично: тот же 404.
    if ((await repo.accessOf(id)) !== 'open') throw notFound();
    const { pages, derivatives } = await repo.findPages(id, lang);
    return {
      items: pages.map((p) => ({
        pageNumber: p.page_number,
        sheetLabel: p.sheet_label,
        assetId: p.asset_id,
        kind: p.kind,
        mimeType: p.mime_type,
        width: p.width,
        height: p.height,
        hasTextLayer: p.has_text_layer,
        downloadAllowed: p.download_allowed,
        alt: p.alt_text,
        altLang: p.alt_lang,
        // URL производных появятся вместе с хранилищем MinIO; пока отдаются только их параметры.
        derivatives: derivatives
          .filter((d) => d.assetId === p.asset_id)
          .map((d) => ({ variant: d.variant, format: d.format, width: d.width, height: d.height })),
      })),
    };
  });

  /**
   * Изображение страницы цифровой копии (F-041, F-042). Только страницы из public_document_pages_v:
   * документ эффективно открыт, файл обработан и проверен антивирусом. Иначе — тот же 404, что для несуществующего.
   */
  app.get('/catalog/documents/:id/pages/:page/image', async (request, reply) => {
    const { id: rawId, page } = z.object({ id: z.string().max(100), page: z.string().max(6) }).parse(request.params);
    const id = uuidOr404({ id: rawId });
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw notFound();
    const file = await repo.findPageFile(id, pageNumber);
    if (!file || !VIEWABLE_TYPES.has(file.mime_type)) throw notFound();
    const body = await opts.storage.read(file.storage_bucket, file.storage_key);
    if (!body) {
      request.log.warn({ assetId: file.asset_id }, 'page file is missing in storage');
      throw notFound();
    }
    return reply
      .header('Content-Type', file.mime_type)
      .header('Content-Disposition', 'inline')
      // SVG открывается браузером как документ: запрещаем скрипты и любые внешние загрузки.
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
      .header('Cache-Control', 'public, max-age=300')
      .send(body);
  });

  app.get('/catalog/fonds', async (request, reply) => {
    const query = fondListSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const { rows, total } = await repo.listFonds(query.branch, query.q, query.page, query.pageSize, lang);
    return pageOf(rows.map((f) => fondDto(f, lang)), total, query.page, query.pageSize);
  });

  app.get('/catalog/fonds/:id', async (request, reply) => {
    const id = uuidOr404(request.params);
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const found = await repo.findFond(id, lang);
    if (!found) throw notFound();
    return {
      ...fondDto(found.fond, lang),
      inventories: found.inventories.map((i) => ({
        id: i.id,
        number: i.inventory_number,
        title: i.title,
        contentLang: i.content_lang,
        years: { from: i.year_from, to: i.year_to },
        access: i.effective_access,
      })),
    };
  });

  app.get('/catalog/inventories/:id', async (request, reply) => {
    const id = uuidOr404(request.params);
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const found = await repo.findInventory(id, lang);
    if (!found) throw notFound();
    const { inventory: i, cases } = found;
    return {
      id: i.id,
      number: i.inventory_number,
      title: i.title,
      annotation: i.annotation,
      contentLang: i.content_lang,
      translationStatus: i.translation_status,
      archiveCode: archiveCodeDto({ fond_number: i.fond_number, inventory_number: i.inventory_number }, lang),
      years: { from: i.year_from, to: i.year_to },
      access: i.effective_access,
      dataOrigin: i.data_origin,
      fond: { id: i.fond_id, number: i.fond_number, title: i.fond_title },
      cases: cases.map((c) => ({
        id: c.id,
        number: c.case_number,
        title: c.title,
        contentLang: c.content_lang,
        date: dateDto(c),
        sheetCount: c.sheet_count,
        access: c.effective_access,
      })),
    };
  });

  app.get('/catalog/cases/:id', async (request, reply) => {
    const id = uuidOr404(request.params);
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const found = await repo.findCase(id, lang);
    if (!found) throw notFound();
    const { kase: c, documents } = found;
    return {
      id: c.id,
      number: c.case_number,
      title: c.title,
      annotation: c.annotation,
      contentLang: c.content_lang,
      translationStatus: c.translation_status,
      archiveCode: archiveCodeDto(
        { fond_number: c.fond_number, inventory_number: c.inventory_number, case_number: c.case_number },
        lang,
      ),
      date: dateDto(c),
      sheetCount: c.sheet_count,
      storageLocation: c.storage_location,
      access: c.effective_access,
      dataOrigin: c.data_origin,
      fond: { id: c.fond_id, number: c.fond_number, title: c.fond_title },
      inventory: { id: c.inventory_id, number: c.inventory_number, title: c.inventory_title },
      documents: documents.map((d) => documentSummaryDto(d, lang)),
    };
  });

  app.get('/catalog/resolve-code', async (request, reply) => {
    const query = resolveCodeSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const code = parseArchiveCode(query.code);
    if (!code) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Archive code not recognised', [{ path: ['code'], code: 'invalid_archive_code' }]);
    }
    return {
      parsed: { ...code, formatted: formatArchiveCode(code, lang) },
      matches: await repo.resolveCode(code, lang),
    };
  });
}

function fondDto(f: FondRow, lang: Locale) {
  return {
    id: f.id,
    number: f.fond_number,
    archiveCode: archiveCodeDto({ fond_number: f.fond_number }, lang),
    title: f.title,
    annotation: f.annotation,
    historyNote: f.history_note,
    contentLang: f.content_lang,
    translationStatus: f.translation_status,
    kind: f.fond_kind,
    years: { from: f.year_from, to: f.year_to },
    unitsCount: f.units_count,
    isHighlighted: f.is_highlighted,
    access: f.access_level,
    branch: { slug: f.branch_slug, name: f.branch_name },
    dataOrigin: f.data_origin,
  };
}
