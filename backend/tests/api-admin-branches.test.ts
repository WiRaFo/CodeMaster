import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';
import { cleanupStaff, createStaff, login, type Client } from './staff.ts';

/** Филиалы в панели (ТЗ §6.4, F-147; дополнение к ТЗ §6: администратор меняет только свой филиал). */
type T = Awaited<ReturnType<typeof testApp>>;
let t: T;
let own: Client;
let admin: Client;
let archivist: Client;
let kurchum: { id: string; phone: string | null; updatedAt: Date };
let zaisanId: string;

beforeAll(async () => {
  t = await testApp();
  const k = await t.db.branch.findUniqueOrThrow({ where: { slug: 'kurchum' }, select: { id: true, phone: true, updatedAt: true } });
  kurchum = k;
  zaisanId = (await t.db.branch.findUniqueOrThrow({ where: { slug: 'zaisan' }, select: { id: true } })).id;
  own = await login(t.app, (await createStaff(t.db, 'branch_admin', { branchId: k.id })).email, undefined, '10.0.9.1');
  admin = await login(t.app, (await createStaff(t.db, 'super_admin')).email, undefined, '10.0.9.2');
  archivist = await login(t.app, (await createStaff(t.db, 'archivist')).email, undefined, '10.0.9.3');
});
afterAll(async () => {
  await t.db.branch.update({ where: { id: kurchum.id }, data: { phone: kurchum.phone, lat: null, lng: null } });
  await cleanupStaff(t.db);
  await t.close();
});

const url = (id: string) => `/api/v1/admin/branches/${id}`;

async function formOf(c: Client, id: string) {
  const res = await c.request('GET', url(id));
  expect(res.status).toBe(200);
  const b = res.body as { phone: string | null; email: string | null; website: string | null; postalCode: string | null; lat: number | null; lng: number | null; showOnMap: boolean; updatedAt: string; translations: Record<string, Record<string, unknown>> };
  const tr = (l: string) => {
    const x = b.translations[l];
    return x ? { fullName: x['fullName'], shortName: x['shortName'], address: x['address'], scheduleText: x['scheduleText'], readingRoomSchedule: x['readingRoomSchedule'] } : undefined;
  };
  return {
    updatedAt: b.updatedAt,
    input: { phone: b.phone, email: b.email, website: b.website, postalCode: b.postalCode, lat: b.lat, lng: b.lng, showOnMap: b.showOnMap, translations: { ru: tr('ru'), kk: tr('kk') } },
  };
}

describe('администратор филиала', () => {
  it('видит в списке только свой филиал', async () => {
    const res = await own.request('GET', '/api/v1/admin/branches');
    expect(res.status).toBe(200);
    expect((res.body['items'] as Array<{ slug: string }>).map((b) => b.slug)).toEqual(['kurchum']);
  });

  it('меняет телефон и координаты своего филиала: сайт показывает новое, журнал фиксирует поля', async () => {
    const { input, updatedAt } = await formOf(own, kurchum.id);
    const res = await own.request('PATCH', url(kurchum.id), { ...input, phone: '8 (72339) 00000', lat: 48.95, lng: 85.82 }, { 'if-match': updatedAt });
    expect(res.status).toBe(200);
    expect(res.body['changed']).toEqual(expect.arrayContaining(['phone', 'lat', 'lng']));
    const pub = await t.app.inject({ method: 'GET', url: '/api/v1/branches/kurchum?lang=ru' });
    expect(pub.json()).toMatchObject({ phone: '8 (72339) 00000' });
    const log = await t.db.auditLog.findFirst({ where: { entityType: 'branch', entityId: kurchum.id }, orderBy: { occurredAt: 'desc' } });
    expect(log).toMatchObject({ action: 'update' });
    expect(Object.keys(log?.changes as Record<string, unknown>)).toEqual(expect.arrayContaining(['phone', 'lat', 'lng']));
  });

  it('чужой филиал: чтение и правка — 404, как у несуществующего; изменений нет', async () => {
    const before = await t.db.branch.findUniqueOrThrow({ where: { id: zaisanId }, select: { phone: true, updatedAt: true } });
    const read = await own.request('GET', url(zaisanId));
    const missing = await own.request('GET', url('00000000-0000-4000-8000-000000000000'));
    expect(read.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(read.body['error']).toMatchObject({ code: 'NOT_FOUND' });
    const { input } = await formOf(admin, zaisanId);
    expect((await own.request('PATCH', url(zaisanId), { ...input, phone: '0' })).status).toBe(404);
    expect(await t.db.branch.findUniqueOrThrow({ where: { id: zaisanId }, select: { phone: true, updatedAt: true } })).toEqual(before);
  });

  it('устаревшая форма — 409; без CSRF — 403', async () => {
    const { input } = await formOf(own, kurchum.id);
    expect((await own.request('PATCH', url(kurchum.id), input, { 'if-match': '2020-01-01T00:00:00.000Z' })).status).toBe(409);
    const noCsrf = await t.app.inject({ method: 'PATCH', url: url(kurchum.id), headers: { cookie: own.cookie }, payload: input });
    expect(noCsrf.statusCode).toBe(403);
  });

  it('проверка полей: одна координата, координаты вне Казахстана, неверная почта и индекс', async () => {
    const { input } = await formOf(own, kurchum.id);
    for (const bad of [{ lat: 49, lng: null }, { lat: 85.8, lng: 48.9 }, { email: 'not-an-email' }, { postalCode: '07000' }, { website: 'http://example.kz' }]) {
      const res = await own.request('PATCH', url(kurchum.id), { ...input, ...bad });
      expect(res.status).toBe(400);
    }
  });
});

describe('права', () => {
  it('сотрудник без права branches:edit получает 403; главный администратор видит все филиалы', async () => {
    expect((await archivist.request('GET', '/api/v1/admin/branches')).status).toBe(403);
    const all = await admin.request('GET', '/api/v1/admin/branches');
    expect((all.body['items'] as unknown[]).length).toBeGreaterThanOrEqual(15);
  });
});
