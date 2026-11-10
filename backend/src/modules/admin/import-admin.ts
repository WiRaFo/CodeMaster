import type { AccessLevel, Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { formatArchiveCode } from '@archive-vko/shared';
import { ApiError } from '../../http/errors.ts';
import { requirePermission, type Staff } from '../../http/staff.ts';
import { hasGrant } from '../auth/session.ts';
import { writeAudit } from '../audit/audit.ts';
import { documentData, expandDate } from './catalog-admin.ts';

/**
 * Пакетный импорт описей в каталог (F-145; дополнение к ТЗ §3.5).
 * Файл CSV или XLSX разбирает браузер и присылает таблицу строк; сервер заново проверяет каждую строку.
 * Шаги: сопоставление столбцов → предпросмотр (ничего не пишет) → загрузка. Всё создаётся черновиками:
 * импорт не публикует и не открывает доступ. Пустой уровень доступа — «закрытый» (§3.1: при неопределённом
 * праве доступ не открывается). Каждая строка сохраняется в своей транзакции: ошибка строки не отменяет
 * уже сохранённые. Дубликат — тот же филиал, фонд, опись, дело и номер документа (без номера — заголовок).
 */

export const IMPORT_FIELDS = [
  { key: 'fond', label: 'Номер фонда', required: true, aliases: ['фонд', 'ф', 'номер фонда', 'fond', 'қор'] },
  { key: 'fondTitle', label: 'Название фонда', required: false, aliases: ['название фонда', 'фондообразователь', 'fond title'] },
  { key: 'inventory', label: 'Номер описи', required: true, aliases: ['опись', 'оп', 'номер описи', 'inventory', 'тізбе'] },
  { key: 'inventoryTitle', label: 'Название описи', required: false, aliases: ['название описи', 'inventory title'] },
  { key: 'case', label: 'Номер дела', required: true, aliases: ['дело', 'д', 'номер дела', 'case', 'file', 'іс'] },
  { key: 'caseTitle', label: 'Заголовок дела', required: false, aliases: ['заголовок дела', 'название дела', 'case title'] },
  { key: 'documentNumber', label: 'Номер документа', required: false, aliases: ['номер документа', '№ документа', 'document number', 'номер'] },
  { key: 'title', label: 'Заголовок документа', required: true, aliases: ['заголовок', 'название', 'заголовок документа', 'title', 'атауы'] },
  { key: 'description', label: 'Краткое содержание', required: false, aliases: ['описание', 'аннотация', 'краткое содержание', 'description'] },
  { key: 'dateFrom', label: 'Дата или начало периода', required: false, aliases: ['дата', 'дата начала', 'год', 'date', 'date from', 'күні'] },
  { key: 'dateTo', label: 'Конец периода', required: false, aliases: ['дата окончания', 'по', 'date to'] },
  { key: 'type', label: 'Вид документа', required: true, aliases: ['вид', 'тип', 'вид документа', 'тип документа', 'type'] },
  { key: 'accessLevel', label: 'Уровень доступа', required: false, aliases: ['доступ', 'уровень доступа', 'access'] },
  { key: 'accessConditions', label: 'Условия доступа', required: false, aliases: ['условия доступа', 'access conditions'] },
  { key: 'sourceNote', label: 'Источник сведений', required: false, aliases: ['источник', 'source'] },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]['key'];
const FIELD_KEYS = IMPORT_FIELDS.map((f) => f.key) as [ImportField, ...ImportField[]];

const MAX_ROWS = 2000;
const cell = z.string().max(5000);

export const importBodySchema = z.object({
  branchSlug: z.string().trim().min(1).max(60),
  dataOrigin: z.enum(['verified', 'demo']),
  fileName: z.string().trim().max(200).optional(),
  header: z.array(cell.max(200)).min(1).max(60),
  rows: z.array(z.array(cell).max(60)).min(1).max(MAX_ROWS),
  /** Поле → номер столбца; без сопоставления сервер предложит его по названиям столбцов. */
  mapping: z.partialRecord(z.enum(FIELD_KEYS), z.number().int().min(0).max(59)).optional(),
});
export type ImportBody = z.infer<typeof importBodySchema>;

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/[.:№]/g, '').replace(/\s+/g, ' ');

/** Предложение сопоставления по названиям столбцов: точное совпадение с подписью или синонимом. */
export function suggestMapping(header: readonly string[]): Partial<Record<ImportField, number>> {
  const result: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    const names = new Set([norm(f.label), ...f.aliases.map(norm)]);
    const i = header.findIndex((h, idx) => !used.has(idx) && names.has(norm(h)));
    if (i >= 0) {
      result[f.key] = i;
      used.add(i);
    }
  }
  return result;
}

/** «14.03.1956» → «1956-03-14», «03.1956» → «1956-03»; ISO и год остаются как есть. Пусто — null, не распознано — undefined. */
export function normalizeDate(raw: string): string | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)) return v;
  const dmy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (dmy) return `${dmy[3]}-${dmy[2]?.padStart(2, '0')}-${dmy[1]?.padStart(2, '0')}`;
  const my = /^(\d{1,2})\.(\d{4})$/.exec(v);
  if (my) return `${my[2]}-${my[1]?.padStart(2, '0')}`;
  return undefined;
}

const ACCESS: Record<string, AccessLevel> = {
  open: 'open', открытый: 'open', открыт: 'open', ашық: 'open',
  restricted: 'restricted', ограниченный: 'restricted', ограничен: 'restricted', шектеулі: 'restricted',
  closed: 'closed', закрытый: 'closed', закрыт: 'closed', жабық: 'closed',
};

export interface RowIssue { field: ImportField | 'row'; code: string; message: string }
export interface RowResult {
  line: number;
  code: string | null;
  title: string | null;
  status: 'ok' | 'error' | 'duplicate';
  issues: RowIssue[];
  creates: Array<'fond' | 'inventory' | 'case'>;
  accessLevel: AccessLevel | null;
}

interface ParsedRow {
  line: number;
  fond: string; fondTitle: string | null;
  inventory: string; inventoryTitle: string | null;
  caseNumber: string; caseTitle: string | null;
  documentNumber: string | null;
  title: string; description: string | null;
  dateFrom: string | null; dateTo: string | null;
  typeCode: string; accessLevel: AccessLevel; accessConditions: string | null; sourceNote: string | null;
}

type TypeMap = Map<string, string>;

interface Context {
  branchId: string;
  types: TypeMap;
  fonds: Map<string, { id: string }>;
  inventories: Map<string, { id: string }>;
  cases: Map<string, { id: string }>;
  existingDocs: Set<string>;
}

const docKey = (r: { fond: string; inventory: string; caseNumber: string; documentNumber: string | null; title: string }) =>
  [r.fond, r.inventory, r.caseNumber, r.documentNumber ? `#${r.documentNumber.toLowerCase()}` : `t:${norm(r.title)}`].join('\u0001');

async function loadContext(db: PrismaClient, branchId: string): Promise<Context> {
  const [types, fonds] = await Promise.all([
    db.documentType.findMany({ select: { id: true, code: true, translations: { select: { name: true } } } }),
    db.fond.findMany({
      where: { branchId, deletedAt: null },
      select: {
        id: true, fondNumber: true,
        inventories: {
          where: { deletedAt: null },
          select: {
            id: true, inventoryNumber: true,
            cases: {
              where: { deletedAt: null },
              select: { id: true, caseNumber: true, documents: { where: { deletedAt: null }, select: { documentNumber: true, translations: { where: { locale: 'ru' }, select: { title: true } } } } },
            },
          },
        },
      },
    }),
  ]);
  const typeMap: TypeMap = new Map();
  for (const t of types) {
    typeMap.set(norm(t.code), t.code);
    for (const tr of t.translations) typeMap.set(norm(tr.name), t.code);
  }
  const ctx: Context = { branchId, types: typeMap, fonds: new Map(), inventories: new Map(), cases: new Map(), existingDocs: new Set() };
  for (const f of fonds) {
    ctx.fonds.set(f.fondNumber, { id: f.id });
    for (const i of f.inventories) {
      ctx.inventories.set(`${f.fondNumber}\u0001${i.inventoryNumber}`, { id: i.id });
      for (const c of i.cases) {
        ctx.cases.set(`${f.fondNumber}\u0001${i.inventoryNumber}\u0001${c.caseNumber}`, { id: c.id });
        for (const d of c.documents) {
          ctx.existingDocs.add(docKey({ fond: f.fondNumber, inventory: i.inventoryNumber, caseNumber: c.caseNumber, documentNumber: d.documentNumber, title: d.translations[0]?.title ?? '' }));
        }
      }
    }
  }
  return ctx;
}

/** Разбор и проверка строк без записи в базу. */
export function analyze(body: ImportBody, mapping: Partial<Record<ImportField, number>>, ctx: Context): { results: RowResult[]; parsed: Map<number, ParsedRow> } {
  const results: RowResult[] = [];
  const parsed = new Map<number, ParsedRow>();
  const seen = new Set<string>();
  const willCreate = { fonds: new Set<string>(), inventories: new Set<string>(), cases: new Set<string>() };
  body.rows.forEach((row, index) => {
    const line = index + 2; // строка 1 — заголовок
    const get = (k: ImportField) => {
      const i = mapping[k];
      return i === undefined ? '' : (row[i] ?? '').trim();
    };
    const issues: RowIssue[] = [];
    if (row.every((c) => !c.trim())) return; // пустая строка таблицы
    for (const f of IMPORT_FIELDS) if (f.required && !get(f.key)) issues.push({ field: f.key, code: 'required', message: `Не заполнено: ${f.label.toLowerCase()}` });

    const dateFrom = normalizeDate(get('dateFrom'));
    const dateTo = normalizeDate(get('dateTo'));
    for (const [k, v] of [['dateFrom', dateFrom], ['dateTo', dateTo]] as const) {
      if (v === undefined) issues.push({ field: k, code: 'invalid_date', message: `Дата не распознана: «${get(k)}». Форматы: 1956, 03.1956, 14.03.1956` });
      else if (v) {
        try {
          expandDate(v, false);
        } catch {
          issues.push({ field: k, code: 'invalid_date', message: `Такой даты нет: «${get(k)}»` });
        }
      }
    }
    if (dateFrom && dateTo && dateTo < dateFrom) issues.push({ field: 'dateTo', code: 'range', message: 'Конец периода раньше начала' });

    const rawType = get('type');
    const typeCode = rawType ? ctx.types.get(norm(rawType)) : undefined;
    if (rawType && !typeCode) issues.push({ field: 'type', code: 'unknown', message: `Неизвестный вид документа: «${rawType}»` });

    const rawAccess = get('accessLevel');
    const accessLevel = rawAccess ? ACCESS[norm(rawAccess)] : 'closed';
    if (!accessLevel) issues.push({ field: 'accessLevel', code: 'unknown', message: `Неизвестный уровень доступа: «${rawAccess}». Допустимо: открытый, ограниченный, закрытый` });
    if (accessLevel === 'restricted' && !get('accessConditions')) issues.push({ field: 'accessConditions', code: 'required', message: 'Для ограниченного доступа укажите условия доступа' });
    for (const [k, max] of [['fond', 30], ['inventory', 30], ['case', 30], ['documentNumber', 30], ['title', 500]] as const) {
      if (get(k).length > max) issues.push({ field: k, code: 'too_long', message: `Слишком длинно: ${IMPORT_FIELDS.find((f) => f.key === k)?.label.toLowerCase()} (до ${max} символов)` });
    }

    const fond = get('fond');
    const inventory = get('inventory');
    const caseNumber = get('case');
    const fKey = fond;
    const iKey = `${fond}\u0001${inventory}`;
    const cKey = `${iKey}\u0001${caseNumber}`;
    const creates: RowResult['creates'] = [];
    if (fond && !ctx.fonds.has(fKey)) {
      creates.push('fond');
      if (!willCreate.fonds.has(fKey) && !get('fondTitle')) issues.push({ field: 'fondTitle', code: 'required', message: `Фонда ${fond} нет в филиале: укажите название фонда` });
    }
    if (inventory && !ctx.inventories.has(iKey)) {
      creates.push('inventory');
      if (!willCreate.inventories.has(iKey) && !get('inventoryTitle')) issues.push({ field: 'inventoryTitle', code: 'required', message: `Описи ${inventory} нет: укажите название описи` });
    }
    if (caseNumber && !ctx.cases.has(cKey)) {
      creates.push('case');
      if (!willCreate.cases.has(cKey) && !get('caseTitle')) issues.push({ field: 'caseTitle', code: 'required', message: `Дела ${caseNumber} нет: укажите заголовок дела` });
    }

    const title = get('title');
    const documentNumber = get('documentNumber') || null;
    const code = fond && inventory && caseNumber ? formatArchiveCode({ fond, inventory, case: caseNumber }, 'ru') : null;
    const key = docKey({ fond, inventory, caseNumber, documentNumber, title });
    let status: RowResult['status'] = issues.length ? 'error' : 'ok';
    if (!issues.length && ctx.existingDocs.has(key)) {
      status = 'duplicate';
      issues.push({ field: 'row', code: 'duplicate', message: 'Такой документ уже есть в каталоге: строка будет пропущена' });
    } else if (!issues.length && seen.has(key)) {
      status = 'duplicate';
      issues.push({ field: 'row', code: 'duplicate_in_file', message: 'Повтор строки выше в этом файле: строка будет пропущена' });
    }
    if (status === 'ok' && typeCode && accessLevel) {
      seen.add(key);
      if (creates.includes('fond')) willCreate.fonds.add(fKey);
      if (creates.includes('inventory')) willCreate.inventories.add(iKey);
      if (creates.includes('case')) willCreate.cases.add(cKey);
      parsed.set(line, {
        line, fond, fondTitle: get('fondTitle') || null, inventory, inventoryTitle: get('inventoryTitle') || null,
        caseNumber, caseTitle: get('caseTitle') || null, documentNumber, title, description: get('description') || null,
        dateFrom: dateFrom ?? null, dateTo: dateTo ?? null, typeCode, accessLevel, accessConditions: get('accessConditions') || null, sourceNote: get('sourceNote') || null,
      });
    }
    results.push({ line, code, title: title || null, status, issues, creates, accessLevel: accessLevel ?? null });
  });
  return { results, parsed };
}

const summaryOf = (results: RowResult[]) => ({
  total: results.length,
  ok: results.filter((r) => r.status === 'ok').length,
  errors: results.filter((r) => r.status === 'error').length,
  duplicates: results.filter((r) => r.status === 'duplicate').length,
});

export async function importAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  /** Право импорта и правки каталога именно в выбранном филиале. */
  async function prepare(request: FastifyRequest): Promise<{ staff: Staff; body: ImportBody; mapping: Partial<Record<ImportField, number>>; ctx: Context }> {
    requirePermission(request, 'catalog:import');
    const body = importBodySchema.parse(request.body);
    const branch = await db.branch.findFirst({ where: { slug: body.branchSlug, deletedAt: null }, select: { id: true } });
    if (!branch) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown branch', [{ path: ['branchSlug'], code: 'unknown' }]);
    const staff = requirePermission(request, 'catalog:edit', branch.id);
    if (!hasGrant(staff.grants, 'catalog:import', branch.id)) throw new ApiError(403, 'FORBIDDEN', 'Permission catalog:import required');
    const mapping = body.mapping ?? suggestMapping(body.header);
    for (const i of Object.values(mapping)) {
      if (i >= body.header.length) throw new ApiError(400, 'VALIDATION_FAILED', 'Column out of range', [{ path: ['mapping'], code: 'out_of_range' }]);
    }
    return { staff, body, mapping, ctx: await loadContext(db, branch.id) };
  }

  app.post('/admin/import/documents/preview', async (request) => {
    const { body, mapping, ctx } = await prepare(request);
    const missing = IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === undefined).map((f) => f.key);
    const { results } = analyze(body, mapping, ctx);
    return {
      fields: IMPORT_FIELDS.map(({ key, label, required }) => ({ key, label, required })),
      mapping,
      missingFields: missing,
      summary: summaryOf(results),
      rows: results,
    };
  });

  app.post('/admin/import/documents/commit', async (request) => {
    const { staff, body, mapping, ctx } = await prepare(request);
    const missing = IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === undefined);
    if (missing.length) throw new ApiError(400, 'VALIDATION_FAILED', 'Required columns are not mapped', missing.map((f) => ({ path: ['mapping', f.key], code: 'required' })));
    const { results, parsed } = analyze(body, mapping, ctx);
    const userId = staff.session.userId;
    const created: Array<{ line: number; id: string }> = [];

    for (const r of results) {
      const p = parsed.get(r.line);
      if (r.status !== 'ok' || !p) continue;
      try {
        const id = await db.$transaction(async (tx) => saveRow(tx, ctx, p, body.dataOrigin, userId));
        created.push({ line: r.line, id });
        // Созданные в этой транзакции фонды, описи и дела уже лежат в ctx: следующие строки их найдут.
      } catch (error) {
        // Откатилась только эта строка; узлы, созданные в её транзакции, убираем из кеша.
        r.status = 'error';
        r.issues.push({ field: 'row', code: 'save_failed', message: error instanceof ApiError ? error.message : 'Строку не удалось сохранить' });
        dropUncommitted(ctx, p);
      }
    }
    const summary = { ...summaryOf(results), created: created.length };
    const protocol = results.filter((r) => r.status !== 'ok').map((r) => ({ line: r.line, status: r.status, issues: r.issues.map((i) => i.message) }));
    const job = await db.$transaction(async (tx) => {
      const row = await tx.importJob.create({
        data: {
          entityType: 'documents', status: created.length ? 'committed' : 'failed', totalRows: summary.total, okRows: created.length,
          errorRows: summary.total - created.length, errors: protocol, createdById: userId, committedAt: new Date(),
        },
      });
      await writeAudit(tx, request, {
        userId, action: 'create', entityType: 'import_job', entityId: row.id,
        summary: `Импорт описи${body.fileName ? ` «${body.fileName}»` : ''}: создано черновиков — ${created.length}, ошибок — ${summary.errors}, дубликатов — ${summary.duplicates}`,
        changes: { total: summary.total, created: created.length, errors: summary.errors, duplicates: summary.duplicates },
      });
      return row;
    });
    return { jobId: job.id, summary, rows: results, created };
  });

  app.get('/admin/import/jobs', async (request) => {
    requirePermission(request, 'catalog:import');
    const jobs = await db.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    return { items: jobs.map((j) => ({ id: j.id, status: j.status, totalRows: j.totalRows, okRows: j.okRows, errorRows: j.errorRows, createdAt: j.createdAt.toISOString() })) };
  });
}

const pendingNodes = new WeakMap<ParsedRow, string[]>();

async function saveRow(tx: Prisma.TransactionClient, ctx: Context, p: ParsedRow, dataOrigin: 'verified' | 'demo', userId: string): Promise<string> {
  const created: string[] = [];
  pendingNodes.set(p, created);
  const base = { accessLevel: 'closed' as const, dataOrigin, createdById: userId, publicationStatus: 'draft' as const };
  const fKey = p.fond;
  const iKey = `${p.fond}\u0001${p.inventory}`;
  const cKey = `${iKey}\u0001${p.caseNumber}`;
  let fond = ctx.fonds.get(fKey);
  if (!fond) {
    const sortable = Number.parseInt(p.fond.replace(/\D+/g, ''), 10);
    fond = await tx.fond.create({
      data: { ...base, branchId: ctx.branchId, fondNumber: p.fond, fondNumberSort: Number.isFinite(sortable) ? sortable : null, translations: { create: { locale: 'ru', title: p.fondTitle ?? p.fond, translationStatus: 'reviewed' } } },
      select: { id: true },
    });
    ctx.fonds.set(fKey, fond);
    created.push(`f:${fKey}`);
  }
  let inventory = ctx.inventories.get(iKey);
  if (!inventory) {
    inventory = await tx.inventory.create({
      data: { ...base, fondId: fond.id, inventoryNumber: p.inventory, translations: { create: { locale: 'ru', title: p.inventoryTitle ?? p.inventory, translationStatus: 'reviewed' } } },
      select: { id: true },
    });
    ctx.inventories.set(iKey, inventory);
    created.push(`i:${iKey}`);
  }
  let kase = ctx.cases.get(cKey);
  if (!kase) {
    kase = await tx.case.create({
      data: { ...base, inventoryId: inventory.id, caseNumber: p.caseNumber, translations: { create: { locale: 'ru', title: p.caseTitle ?? p.caseNumber, translationStatus: 'reviewed' } } },
      select: { id: true },
    });
    ctx.cases.set(cKey, kase);
    created.push(`c:${cKey}`);
  }
  const data = await documentData(tx, {
    caseId: kase.id, documentNumber: p.documentNumber, documentTypeCode: p.typeCode, dateFrom: p.dateFrom, dateTo: p.dateTo,
    sheetsFrom: null, sheetsTo: null, sheetCount: null, originalLanguages: [], authorText: null, storageLocation: null,
    accessLevel: p.accessLevel, dataOrigin, sourceNote: p.sourceNote, translations: {},
  });
  const doc = await tx.document.create({
    data: {
      ...data, publicationStatus: 'draft', createdById: userId, updatedById: userId,
      translations: { create: { locale: 'ru', title: p.title, description: p.description, accessConditions: p.accessConditions, translationStatus: 'reviewed', translatedById: userId } },
    },
    select: { id: true },
  });
  ctx.existingDocs.add(docKey(p));
  return doc.id;
}

function dropUncommitted(ctx: Context, p: ParsedRow): void {
  for (const key of pendingNodes.get(p) ?? []) {
    const [kind, k] = [key.slice(0, 1), key.slice(2)];
    if (kind === 'f') ctx.fonds.delete(k);
    if (kind === 'i') ctx.inventories.delete(k);
    if (kind === 'c') ctx.cases.delete(k);
  }
  ctx.existingDocs.delete(docKey(p));
}
