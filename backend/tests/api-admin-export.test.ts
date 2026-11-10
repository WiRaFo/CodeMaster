import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csvCell, exportDate } from '../src/modules/admin/export-admin.ts';
import { IMPORT_FIELDS, suggestMapping } from '../src/modules/admin/import-admin.ts';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** Экспорт каталога в CSV (ТЗ §6.3, F-145): столбцы шаблона импорта, филиал и статус; права и журнал. */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let admin: Client;
let own: Client;
let analyst: Client;

beforeAll(async () => {
  t = await testApp();
  const ridder = await t.db.branch.findUniqueOrThrow({ where: { slug: 'ridder' }, select: { id: true } });
  admin = await login(t.app, (await createStaff(t.db, 'super_admin')).email, undefined, '10.0.11.1');
  own = await login(t.app, (await createStaff(t.db, 'branch_admin', { branchId: ridder.id })).email, undefined, '10.0.11.2');
  analyst = await login(t.app, (await createStaff(t.db, 'analyst')).email, undefined, '10.0.11.3');
});
afterAll(async () => {
  await cleanupStaff(t.db);
  await t.close();
});

const URL = '/api/v1/admin/export/documents.csv';
const parse = (text: string) => text.replace(/^﻿/, '').trimEnd().split('\r\n').map((l) => l.split(';'));

describe('экспорт каталога', () => {
  it('главный администратор получает все записи, включая закрытые; заголовки совпадают с импортом; запись в журнале', async () => {
    const res = await admin.request('GET', URL);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="catalog-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.text.startsWith('﻿')).toBe(true);
    const [header = [], ...rows] = parse(res.text);
    expect(header).toEqual([...IMPORT_FIELDS.map((f) => f.label), 'Филиал', 'Статус публикации']);
    // Выгрузку можно загрузить обратно: импорт узнаёт каждый столбец.
    expect(Object.keys(suggestMapping(header)).sort()).toEqual(IMPORT_FIELDS.map((f) => f.key).sort());
    const total = await t.db.document.count({ where: { deletedAt: null, case: { deletedAt: null, inventory: { deletedAt: null, fond: { deletedAt: null } } } } });
    expect(rows).toHaveLength(total);
    expect(rows.some((r) => r[12] === 'закрытый')).toBe(true);
    expect(await t.db.auditLog.findFirst({ where: { action: 'export', entityType: 'document' }, orderBy: { occurredAt: 'desc' } })).not.toBeNull();
  });

  it('фильтр по статусу публикации', async () => {
    const res = await admin.request('GET', `${URL}?status=published`);
    const rows = parse(res.text).slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.at(-1) === 'опубликовано')).toBe(true);
  });

  it('администратор филиала получает только свой филиал; без прав каталога — 403', async () => {
    const res = await own.request('GET', URL);
    expect(res.status).toBe(200);
    expect(parse(res.text).slice(1).every((r) => r.at(-2) === 'ridder')).toBe(true);
    expect((await analyst.request('GET', URL)).status).toBe(403);
  });
});

describe('форматирование', () => {
  it('ячейки: кавычки, разделитель, переносы; формулы Excel обезврежены', () => {
    expect(csvCell('просто')).toBe('просто');
    expect(csvCell('а;б')).toBe('"а;б"');
    expect(csvCell('сказал "да"')).toBe('"сказал ""да"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('');
  });

  it('дата в точности записи', () => {
    const d = new Date('1957-03-14T00:00:00Z');
    expect(exportDate(d, 'day')).toBe('1957-03-14');
    expect(exportDate(d, 'month')).toBe('1957-03');
    expect(exportDate(d, 'year')).toBe('1957');
    expect(exportDate(null, 'year')).toBe('');
  });
});
