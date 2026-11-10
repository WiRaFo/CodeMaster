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
    expect(items.map((b) => b['slug'])).toEqual([
      'main', 'main-krylova', 'altai', 'glubokoe', 'zaisan', 'katon-karagay', 'kurchum', 'markakol', 'ridder', 'samar',
      'tarbagatai', 'ulan', 'ulken-naryn', 'ust-kamenogorsk-personnel', 'shemonaikha',
    ]);
    for (const b of items) {
      expect(b['coordinates']).toBeNull();
      // Сведения от архива (10.11.2026) сверены; площадка на ул. Крылова есть только на старом сайте.
      const fromOldSite = b['slug'] === 'main-krylova';
      expect(b['needsVerification']).toBe(fromOldSite);
      expect(b['dataOrigin']).toBe(fromOldSite ? 'migrated' : 'verified');
    }
    expect((await t.get('/api/v1/branches/synthetic-draft')).status).toBe(404);
  });

  it('ищет по названию и по историческому названию населённого пункта, фильтрует по типу', async () => {
    const byHistoric = await t.get(`/api/v1/branches?q=${encodeURIComponent('Лениногорск')}`);
    expect(byHistoric.body.items?.map((b) => b['slug'])).toEqual(['ridder']);
    const byName = await t.get(`/api/v1/branches?q=${encodeURIComponent('Зайсан')}`);
    expect(byName.body.items?.map((b) => b['slug'])).toEqual(['zaisan']);
    const byType = await t.get('/api/v1/branches?type=branch');
    expect(byType.body.items).toHaveLength(13);
  });

  it('карточка основного архива: график и реквизиты из сведений архива, площадки', async () => {
    const res = await t.get('/api/v1/branches/main?lang=ru');
    expect(res.body).toMatchObject({
      isMain: true,
      address: 'г. Усть-Каменогорск, ул. Бейбітшілік, 26/1 (Головкова, 26/1)',
      phone: '8 (7232) 25-59-76',
      email: 'arhiv-ukg@yandex.kz',
      postalCode: '070000',
      verifiedAt: '2026-11-10',
      sourceUrl: null,
      dataOrigin: 'verified',
    });
    const schedule = res.body['schedule'] as { office: Array<{ opens: string; closes: string }>; readingRoom: Array<{ opens: string; closes: string }> };
    expect(schedule.office).toHaveLength(5);
    expect(schedule.office[0]).toMatchObject({ opens: '08:00', closes: '17:00' });
    expect(schedule.readingRoom[0]).toMatchObject({ opens: '09:00', closes: '16:00' });
    expect((res.body['sites'] as Array<{ slug: string }>).map((s) => s.slug)).toContain('main-krylova');
  });

  it('карточка филиала: директор из сведений архива; адрес почты с опечаткой в источнике не публикуется', async () => {
    const ulan = await t.get('/api/v1/branches/ulan?lang=ru');
    expect(ulan.body).toMatchObject({ phone: '8 (72338) 27120', email: 'a.abdrasulin@akimvko.gov.kz', verifiedAt: '2026-11-10' });
    expect(ulan.body['staff']).toMatchObject([{ fullName: 'Абдрасулин Аслан Оралович', position: 'Директор филиала' }]);
    for (const slug of ['glubokoe', 'zaisan']) {
      expect((await t.get(`/api/v1/branches/${slug}`)).body['email']).toBeNull();
    }
  });
});

describe('«Об архиве» (ТЗ §5.2)', () => {
  it('история от архива на русском с пометкой языка, руководство и соцсети', async () => {
    const res = await t.get('/api/v1/about?lang=kk');
    const history = res.body['history'] as { contentLang: string; dataOrigin: string; blocks: Array<{ type: string; text?: string }> };
    expect(history).toMatchObject({ contentLang: 'ru', dataOrigin: 'verified' });
    expect(history.blocks[0]?.text).toMatch(/^Государственный архив Восточно-Казахстанской области образован в 1940 году/);
    const staff = res.body['staff'] as Array<{ fullName: string; position: string; contentLang: string }>;
    expect(staff[0]).toMatchObject({ fullName: 'Жапаров Аскар Кенжебаевич', position: 'Директор', contentLang: 'kk' });
    expect(staff).toHaveLength(10);
    expect(res.body['social']).toEqual([
      { network: 'instagram', label: '@arhiv_vko', url: 'https://www.instagram.com/arhiv_vko/' },
      { network: 'facebook', label: 'vkoarhiv', url: 'https://www.facebook.com/vkoarhiv' },
    ]);
  });
});

describe('координаты для карты (ЭТАП 9, F-060, F-147)', () => {
  it('координаты отдаются, только если подразделение отмечено для карты; иначе их нет ни в списке, ни в карточке', async () => {
    const coords = { lat: 50.1, lng: 83.2 }; // тестовые значения, не координаты филиала
    await t.db.branch.update({ where: { slug: 'zaisan' }, data: { ...coords, showOnMap: false } });
    try {
      const hidden = await t.get('/api/v1/branches?q=' + encodeURIComponent('Зайсан'));
      expect(hidden.body.items?.[0]?.['coordinates']).toBeNull();
      expect((await t.get('/api/v1/branches/zaisan')).body['coordinates']).toBeNull();
      await t.db.branch.update({ where: { slug: 'zaisan' }, data: { showOnMap: true } });
      const shown = await t.get('/api/v1/branches?q=' + encodeURIComponent('Зайсан'));
      expect(shown.body.items?.[0]?.['coordinates']).toEqual(coords);
      expect((await t.get('/api/v1/branches/zaisan')).body['coordinates']).toEqual(coords);
    } finally {
      await t.db.branch.update({ where: { slug: 'zaisan' }, data: { lat: null, lng: null, showOnMap: false } });
    }
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

describe('календарь памятных дат (сведения архива)', () => {
  it('годы 2022–2026; записи года по порядку источника; фильтр по месяцу; английский — русский текст с contentLang', async () => {
    const all = await t.get('/api/v1/calendar?year=2026&lang=kk');
    expect(all.body['years']).toEqual([2026, 2025, 2024, 2023, 2022]);
    const items = all.body.items ?? [];
    expect(items).toHaveLength(42);
    expect(items[0]).toMatchObject({ month: 1, day: 8, dateLabel: '8 қаңтар', contentLang: 'kk' });
    expect(items.filter((x) => x['month'] === null).length).toBeGreaterThan(0);
    const nov = await t.get('/api/v1/calendar?year=2026&month=11&lang=en');
    expect(nov.body.items?.map((x) => [x['dateLabel'], x['contentLang']])).toEqual([['ноябрь', 'ru']]);
    expect((await t.get('/api/v1/calendar?year=1999')).body.items).toEqual([]);
    expect((await t.get('/api/v1/calendar?month=13')).status).toBe(400);
  });
});

