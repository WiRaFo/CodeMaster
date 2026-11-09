import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.ts';

let t: Awaited<ReturnType<typeof testApp>>;
beforeAll(async () => {
  t = await testApp();
});
afterAll(() => t.close());

describe('филиалы (ТЗ §5.5)', () => {
  it('список содержит только опубликованные подразделения без выдуманных координат', async () => {
    const res = await t.get('/api/v1/branches?lang=ru');
    const items = res.body.items ?? [];
    expect(items.map((b) => b['slug'])).toEqual(['main', 'main-krylova', 'ust-kamenogorsk-personnel', 'zaisan', 'ridder', 'altai']);
    for (const b of items) {
      expect(b['coordinates']).toBeNull();
      expect(b['needsVerification']).toBe(true);
      expect(b['dataOrigin']).toBe('migrated');
    }
    expect((await t.get('/api/v1/branches/synthetic-draft')).status).toBe(404);
  });

  it('ищет по названию и по историческому названию населённого пункта, фильтрует по типу', async () => {
    const byHistoric = await t.get(`/api/v1/branches?q=${encodeURIComponent('Лениногорск')}`);
    expect(byHistoric.body.items?.map((b) => b['slug'])).toEqual(['ridder']);
    const byName = await t.get(`/api/v1/branches?q=${encodeURIComponent('Зайсан')}`);
    expect(byName.body.items?.map((b) => b['slug'])).toEqual(['zaisan']);
    const byType = await t.get('/api/v1/branches?type=branch');
    expect(byType.body.items).toHaveLength(4);
  });

  it('карточка основного архива: график, площадки, источник сведений', async () => {
    const res = await t.get('/api/v1/branches/main?lang=ru');
    expect(res.body).toMatchObject({
      isMain: true,
      address: 'г. Усть-Каменогорск, ул. Головкова, 26/1',
      phone: '8 (7232) 25-59-76',
      postalCode: null,
      verifiedAt: null,
      sourceUrl: 'http://e-arhiv.vko.gov.kz/ru/Page/Index/1330',
    });
    const schedule = res.body['schedule'] as { office: unknown[]; readingRoom: Array<{ opens: string; closes: string }> };
    expect(schedule.office).toHaveLength(5);
    expect(schedule.readingRoom[0]).toMatchObject({ opens: '10:00', closes: '17:00' });
    expect((res.body['sites'] as Array<{ slug: string }>).map((s) => s.slug)).toContain('main-krylova');
  });
});

describe('справочники', () => {
  it('типы документов, периоды, тематики и населённые пункты', async () => {
    expect((await t.get('/api/v1/reference/document-types')).body.items).toHaveLength(7);
    expect((await t.get('/api/v1/reference/periods')).body.items).toHaveLength(5);
    expect((await t.get('/api/v1/reference/topics?kind=history_topic')).body.items).toHaveLength(11);
    expect((await t.get('/api/v1/branch-types')).body.items).toHaveLength(3);
    const settlements = await t.get('/api/v1/reference/settlements?lang=ru');
    expect(settlements.body.items).toContainEqual({
      slug: 'ridder',
      name: 'Риддер',
      historicalNames: [{ name: 'Лениногорск', validFrom: 1941, validTo: 2002 }],
    });
  });
});
