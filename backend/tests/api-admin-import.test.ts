import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeDate, suggestMapping } from '../src/modules/admin/import-admin.ts';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** Импорт описи из CSV/XLSX (F-145; дополнение к ТЗ §3.5). */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let archivist: Client;
let branchAdmin: Client;
const fond = `T${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const header = ['Фонд', 'Название фонда', 'Опись', 'Название описи', 'Дело', 'Заголовок дела', 'Номер документа', 'Заголовок', 'Дата', 'Вид документа', 'Доступ', 'Условия доступа'];
const row = (over: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    'Фонд': fond, 'Название фонда': '[Демо] Тестовый фонд', 'Опись': '1', 'Название описи': 'Опись дел постоянного хранения',
    'Дело': '1', 'Заголовок дела': 'Приказы', 'Номер документа': '1', 'Заголовок': '[Демо] Приказ № 1', 'Дата': '14.03.1956',
    'Вид документа': 'Письменные источники', 'Доступ': '', 'Условия доступа': '', ...over,
  };
  return header.map((h) => base[h] ?? '');
};

beforeAll(async () => {
  t = await testApp();
  archivist = await login(t.app, (await createStaff(t.db, 'archivist')).email, undefined, '10.0.10.1');
  const ridder = await t.db.branch.findUniqueOrThrow({ where: { slug: 'ridder' }, select: { id: true } });
  branchAdmin = await login(t.app, (await createStaff(t.db, 'branch_admin', { branchId: ridder.id })).email, undefined, '10.0.10.2');
});
afterAll(async () => {
  await cleanupStaff(t.db);
  await t.close();
});

describe('разбор', () => {
  it('даты и сопоставление столбцов по названиям', () => {
    expect(normalizeDate('14.03.1956')).toBe('1956-03-14');
    expect(normalizeDate('3.1956')).toBe('1956-03');
    expect(normalizeDate('1956')).toBe('1956');
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate('весна 1956')).toBeUndefined();
    expect(suggestMapping(header)).toMatchObject({ fond: 0, fondTitle: 1, inventory: 2, case: 4, title: 7, dateFrom: 8, type: 9, accessLevel: 10 });
  });
});

describe('предпросмотр и загрузка', () => {
  const body = (rows: string[][]) => ({ branchSlug: 'main', dataOrigin: 'demo', fileName: 'opis.csv', header, rows });

  it('предпросмотр ничего не пишет и показывает ошибки по строкам', async () => {
    const before = await t.db.document.count();
    const res = await archivist.request('POST', '/api/v1/admin/import/documents/preview', body([
      row(),
      row({ 'Номер документа': '2', 'Дата': '31.02.1956' }),
      row({ 'Номер документа': '3', 'Вид документа': 'Пергамент' }),
      row({ 'Номер документа': '4', 'Доступ': 'ограниченный' }),
      row(),
    ]));
    expect(res.status).toBe(200);
    expect(res.body['summary']).toEqual({ total: 5, ok: 1, errors: 3, duplicates: 1 });
    const rows = res.body['rows'] as Array<{ line: number; status: string; issues: Array<{ code: string }>; creates: string[]; accessLevel: string }>;
    expect(rows[0]).toMatchObject({ line: 2, status: 'ok', creates: ['fond', 'inventory', 'case'], accessLevel: 'closed' });
    expect(rows[1]?.issues.map((i) => i.code)).toContain('invalid_date');
    expect(rows[2]?.issues.map((i) => i.code)).toContain('unknown');
    expect(rows[3]?.issues.map((i) => i.code)).toContain('required');
    expect(rows[4]?.issues.map((i) => i.code)).toEqual(['duplicate_in_file']);
    expect(await t.db.document.count()).toBe(before);
  });

  it('загрузка: верные строки — черновики с закрытым доступом, ошибки в протоколе, журнал; повтор — дубликаты', async () => {
    const res = await archivist.request('POST', '/api/v1/admin/import/documents/commit', body([
      row(),
      row({ 'Номер документа': '2', 'Заголовок': '[Демо] Приказ № 2', 'Доступ': 'открытый' }),
      row({ 'Номер документа': '3', 'Дата': 'когда-то' }),
    ]));
    expect(res.status).toBe(200);
    expect(res.body['summary']).toMatchObject({ total: 3, ok: 2, errors: 1, created: 2 });
    const created = res.body['created'] as Array<{ id: string }>;
    const docs = await t.db.document.findMany({ where: { id: { in: created.map((c) => c.id) } }, select: { publicationStatus: true, accessLevel: true, dataOrigin: true } });
    expect(docs.map((d) => d.publicationStatus)).toEqual(['draft', 'draft']);
    expect(docs.map((d) => d.accessLevel).sort()).toEqual(['closed', 'open']);
    const f = await t.db.fond.findFirstOrThrow({ where: { fondNumber: fond }, select: { publicationStatus: true, accessLevel: true } });
    expect(f).toEqual({ publicationStatus: 'draft', accessLevel: 'closed' });
    const job = await t.db.importJob.findUniqueOrThrow({ where: { id: res.body['jobId'] as string } });
    expect(job).toMatchObject({ status: 'committed', totalRows: 3, okRows: 2, errorRows: 1 });
    const log = await t.db.auditLog.findFirst({ where: { entityType: 'import_job', entityId: job.id } });
    expect(log?.summary).toContain('создано черновиков — 2');
    // Черновики не видны на сайте.
    const pub = await t.app.inject({ method: 'GET', url: `/api/v1/catalog/documents?lang=ru&q=${encodeURIComponent('Приказ № 2')}` });
    expect(JSON.stringify(pub.json())).not.toContain('[Демо] Приказ № 2');

    const again = await archivist.request('POST', '/api/v1/admin/import/documents/preview', body([row()]));
    expect(again.body['summary']).toMatchObject({ ok: 0, duplicates: 1 });
  });

  it('без сопоставления обязательных столбцов загрузка отклоняется', async () => {
    const res = await archivist.request('POST', '/api/v1/admin/import/documents/commit', { ...body([row()]), mapping: { fond: 0, inventory: 2, case: 4 } });
    expect(res.status).toBe(400);
  });
});

describe('права', () => {
  it('администратор филиала без права импорта — 403; ничего не создано', async () => {
    const res = await branchAdmin.request('POST', '/api/v1/admin/import/documents/preview', { branchSlug: 'ridder', dataOrigin: 'demo', header, rows: [row()] });
    expect(res.status).toBe(403);
  });
});
