import type { PrismaClient } from '@prisma/client';
import {
  ARCHIVE_BRANCHES, ARCHIVE_DATA_DATE, ARCHIVE_MAIN, ARCHIVE_SETTLEMENTS, ARCHIVE_SOCIAL, ARCHIVE_STAFF, BRANCH_DIRECTOR,
} from './archive-data.ts';
import { ANTICORRUPTION_SETTING, ANTICORRUPTION_TEXT } from './archive-anticorruption.ts';
import { seedAssistantKnowledge } from './assistant-knowledge.ts';
import { ARCHIVE_CALENDAR } from './archive-calendar.ts';
import { ARCHIVE_HISTORY_RU, type HistoryBlock } from './archive-history.ts';
import { ARCHIVE_TIMELINE, timelineText } from './archive-timeline.ts';
import { ARCHIVE_PERSONS, personEntries } from './archive-persons.ts';
import { INFO_PAGES, type InfoBlock } from './info-pages.ts';
import { names, translationRows, OLD_SITE_CONTACTS_URL, type Tri } from './lib.ts';

/**
 * Реальные сведения об архиве. Набор «migrated» допустим в production.
 * - Переданное архивом 10.11.2026 (archive-data.ts, archive-history.ts): data_origin = verified, verified_at = дата передачи.
 * - Перенесённое со старого сайта по аудиту и не подтверждённое архивом (площадка на ул. Крылова):
 *   data_origin = migrated, verified_at = NULL, интерфейс показывает «требует сверки» (requirements-matrix Q-22, Q-23).
 * Координаты не заполняются и на карту записи не выводятся.
 */

interface SettlementSeed {
  slug: string;
  current: Tri<{ name: string }>;
  historical: Array<{ name: string; validFrom: number | null; validTo: number | null }>;
}

const SETTLEMENTS: SettlementSeed[] = [
  { slug: 'ust-kamenogorsk', current: names('Усть-Каменогорск', 'Өскемен', 'Oskemen'), historical: [] },
  { slug: 'ridder', current: names('Риддер', 'Риддер', 'Ridder'), historical: [{ name: 'Лениногорск', validFrom: 1941, validTo: 2002 }] },
  { slug: 'altai', current: names('Алтай', 'Алтай', 'Altai'), historical: [{ name: 'Зыряновск', validFrom: null, validTo: 2019 }] },
  { slug: 'zaisan', current: names('Зайсан', 'Зайсан', 'Zaisan'), historical: [] },
  { slug: 'semey', current: names('Семей', 'Семей', 'Semey'), historical: [{ name: 'Семипалатинск', validFrom: null, validTo: 2007 }] },
  ...ARCHIVE_SETTLEMENTS.map((x) => ({ ...x, historical: [] })),
];

const NEEDS_CHECK: Tri<string> = {
  ru: 'Сведения перенесены с текущего сайта и требуют сверки с архивом.',
  kk: 'Мәліметтер қазіргі сайттан көшірілді, мұрағатпен салыстырып тексеруді қажет етеді.',
  en: 'Transferred from the current website; pending verification by the archive.',
};

const WEEKDAYS = [1, 2, 3, 4, 5] as const;

interface BranchSeed {
  slug: string;
  type: 'main_archive' | 'site' | 'branch';
  parent?: string;
  isMain?: boolean;
  settlement: string;
  postalCode?: string;
  phone?: string | undefined;
  email?: string | undefined;
  /** Задан — сведения подтверждены архивом; нет — перенесены со старого сайта и требуют сверки. */
  verifiedAt?: Date;
  sourceUrl?: string;
  sortOrder: number;
  texts: Tri<{ fullName: string; shortName: string; address?: string; scheduleText?: string; readingRoomSchedule?: string; description?: string }>;
  office?: [string, string];
  readingRoom?: [string, string];
  director?: string;
}

const BRANCHES: BranchSeed[] = [
  {
    slug: 'main',
    type: 'main_archive',
    isMain: true,
    settlement: 'ust-kamenogorsk',
    postalCode: ARCHIVE_MAIN.postalCode,
    phone: ARCHIVE_MAIN.phone,
    email: ARCHIVE_MAIN.email,
    verifiedAt: ARCHIVE_DATA_DATE,
    sortOrder: 0,
    texts: ARCHIVE_MAIN.texts,
    office: ARCHIVE_MAIN.office,
    readingRoom: ARCHIVE_MAIN.readingRoom,
  },
  {
    // Площадка из данных старого сайта; в списке, переданном архивом, её нет. Часы читального зала
    // старого сайта расходятся с данными архива, поэтому не публикуются.
    slug: 'main-krylova',
    type: 'site',
    parent: 'main',
    settlement: 'ust-kamenogorsk',
    phone: '8 (7232) 25-13-47',
    sourceUrl: OLD_SITE_CONTACTS_URL,
    sortOrder: 1,
    texts: {
      ru: { fullName: 'Государственный архив ВКО, площадка на ул. Крылова', shortName: 'ул. Крылова, 39', address: 'г. Усть-Каменогорск, ул. Крылова, 39' },
      kk: { fullName: 'ШҚО мемлекеттік мұрағаты, Крылов көшесіндегі алаң', shortName: 'Крылов к-сі, 39', address: 'Өскемен қ., Крылов к-сі, 39' },
      en: { fullName: 'State Archive of EKR, Krylov Street site', shortName: '39 Krylov St', address: '39 Krylov St, Oskemen' },
    },
  },
  ...ARCHIVE_BRANCHES.map((b, i): BranchSeed => ({
    slug: b.slug,
    type: 'branch',
    parent: 'main',
    settlement: b.settlement,
    phone: b.phone,
    email: b.email,
    verifiedAt: ARCHIVE_DATA_DATE,
    sortOrder: 10 + i,
    texts: {
      ru: { ...b.names.ru, address: b.address },
      kk: { ...b.names.kk, address: b.address },
      en: { ...b.names.en, address: b.address },
    },
    director: b.director,
  })),
];

export async function seedMigrated(db: PrismaClient): Promise<void> {
  const settlementIds = new Map<string, string>();
  for (const s of SETTLEMENTS) {
    const row = await db.settlement.upsert({ where: { slug: s.slug }, update: {}, create: { slug: s.slug } });
    settlementIds.set(s.slug, row.id);
    await db.settlementTranslation.createMany({
      data: translationRows(s.current).map((t) => ({ ...t, settlementId: row.id })),
      skipDuplicates: true,
    });
    await db.settlementName.deleteMany({ where: { settlementId: row.id } });
    await db.settlementName.createMany({
      data: s.historical.map((h) => ({ ...h, settlementId: row.id, locale: 'ru' as const })),
    });
  }

  const typeIds = new Map((await db.branchType.findMany()).map((t) => [t.code, t.id]));
  const branchIds = new Map<string, string>();
  for (const b of BRANCHES) {
    const branchTypeId = typeIds.get(b.type);
    if (!branchTypeId) throw new Error(`Нет типа подразделения ${b.type}; сначала запустите справочники`);
    const data = {
      branchTypeId,
      parentBranchId: b.parent ? branchIds.get(b.parent) ?? null : null,
      isMain: b.isMain ?? false,
      settlementId: settlementIds.get(b.settlement) ?? null,
      postalCode: b.postalCode ?? null,
      phone: b.phone ?? null,
      email: b.email ?? null,
      showOnMap: false,
      sortOrder: b.sortOrder,
      verifiedAt: b.verifiedAt ?? null,
      sourceUrl: b.sourceUrl ?? null,
      publicationStatus: 'published' as const,
      dataOrigin: b.verifiedAt ? ('verified' as const) : ('migrated' as const),
    };
    const row = await db.branch.upsert({ where: { slug: b.slug }, update: data, create: { slug: b.slug, ...data } });
    branchIds.set(b.slug, row.id);

    await db.branchTranslation.deleteMany({ where: { branchId: row.id } });
    await db.branchTranslation.createMany({
      data: translationRows(b.texts).map((t) => ({ ...t, branchId: row.id, description: t.description ?? (b.verifiedAt ? null : NEEDS_CHECK[t.locale]) })),
    });

    await db.branchSchedule.deleteMany({ where: { branchId: row.id } });
    const hours = (kind: string, range: [string, string] | undefined) =>
      range ? WEEKDAYS.map((weekday) => ({ weekday, kind, opens: range[0], closes: range[1] })) : [];
    const schedule = [...hours('office', b.office), ...hours('reading_room', b.readingRoom)];
    await db.branchSchedule.createMany({ data: schedule.map((s) => ({ ...s, branchId: row.id })) });
  }

  await seedStaff(db, branchIds);
  await seedAboutPages(db);
  await seedCalendar(db);
  await seedTimeline(db);
  await seedPersons(db);
  await seedAnticorruption(db);
  await seedInfoPages(db);
  await seedAssistantKnowledge(db);
  await db.siteSetting.upsert({
    where: { key: 'social_links' },
    update: { value: ARCHIVE_SOCIAL },
    create: { key: 'social_links', value: ARCHIVE_SOCIAL },
  });
}

/** Руководство и отделы основного архива, директора филиалов («Структура.docx», «Адреса и контакты филиалов.xls»). */
async function seedStaff(db: PrismaClient, branchIds: Map<string, string>): Promise<void> {
  await db.staffContact.deleteMany({ where: { dataOrigin: 'verified' } });
  const mainId = branchIds.get('main') ?? null;
  const rows = [
    ...ARCHIVE_STAFF.map((p) => ({ branchId: mainId, phone: p.phone, email: p.email, fullName: p.fullName, position: p.position, department: p.department as Tri<string> | null })),
    ...ARCHIVE_BRANCHES.map((b) => ({ branchId: branchIds.get(b.slug) ?? null, phone: b.phone, email: b.email, fullName: b.director, position: BRANCH_DIRECTOR, department: null })),
  ];
  for (const [i, r] of rows.entries()) {
    const row = await db.staffContact.create({
      data: {
        branchId: r.branchId, phone: r.phone ?? null, email: r.email ?? null, sortOrder: i,
        verifiedAt: ARCHIVE_DATA_DATE, publicationStatus: 'published', dataOrigin: 'verified',
      },
    });
    const texts: Tri<{ fullName: string; position: string; department: string | null }> = {
      ru: { fullName: r.fullName, position: r.position.ru, department: r.department?.ru ?? null },
      kk: { fullName: r.fullName, position: r.position.kk, department: r.department?.kk ?? null },
      en: { fullName: r.fullName, position: r.position.en, department: r.department?.en ?? null },
    };
    await db.staffContactTranslation.createMany({ data: translationRows(texts).map((t) => ({ ...t, staffContactId: row.id })) });
  }
}

/** «История архива»: текст только на русском; на казахском и английском страница показывает его с пометкой о языке. */
async function seedAboutPages(db: PrismaClient): Promise<void> {
  const data = { sortOrder: 0, publicationStatus: 'published' as const, dataOrigin: 'verified' as const, sourceUrl: null };
  const page = await db.page.upsert({ where: { key: 'about/history' }, update: data, create: { key: 'about/history', ...data } });
  await db.pageTranslation.deleteMany({ where: { pageId: page.id } });
  await db.pageTranslation.create({
    data: {
      pageId: page.id,
      locale: 'ru',
      title: 'История архива',
      body: ARCHIVE_HISTORY_RU,
      bodyText: blocksText(ARCHIVE_HISTORY_RU),
      translationStatus: 'reviewed',
    },
  });
}

/** Календарь памятных дат: русский и казахский тексты из источника, порядок строк сохраняется. */
/** Хронология архива (F-083): события из «Истории архива», только на русском. */
async function seedTimeline(db: PrismaClient): Promise<void> {
  for (const e of ARCHIVE_TIMELINE) {
    const data = {
      year: e.year,
      eventDate: e.date ? new Date(`${e.date}T00:00:00Z`) : null,
      datePrecision: e.date ? ('day' as const) : ('year' as const),
      sourceNote: 'Текст «История архива», передан архивом 10.11.2026',
      publicationStatus: 'published' as const,
      dataOrigin: 'verified' as const,
    };
    const row = await db.historicalEvent.upsert({ where: { slug: e.slug }, update: data, create: { slug: e.slug, ...data } });
    await db.historicalEventTranslation.deleteMany({ where: { eventId: row.id } });
    await db.historicalEventTranslation.create({ data: { eventId: row.id, locale: 'ru', title: e.title, description: timelineText(e), translationStatus: 'reviewed' } });
  }
}

/**
 * Исторические личности (F-086) из календаря памятных дат; связи с записями календаря пересоздаются,
 * потому что календарь пересоздаётся при каждом запуске сида.
 */
async function seedPersons(db: PrismaClient): Promise<void> {
  const dates = await db.memorableDate.findMany({
    where: { dataOrigin: 'verified' },
    select: { id: true, calendarYear: true, translations: { where: { locale: 'ru' }, select: { text: true } } },
  });
  for (const p of ARCHIVE_PERSONS) {
    const data = {
      birthYear: p.birthYear,
      deathYear: p.deathYear,
      sourceNote: 'Календарь памятных дат 2022–2026, передан архивом 10.11.2026',
      publicationStatus: 'published' as const,
      dataOrigin: 'verified' as const,
    };
    const row = await db.historicalPerson.upsert({ where: { slug: p.slug }, update: data, create: { slug: p.slug, ...data } });
    await db.historicalPersonTranslation.deleteMany({ where: { personId: row.id } });
    const years = p.birthYear && p.deathYear ? `${p.birthYear}–${p.deathYear}` : null;
    await db.historicalPersonTranslation.createMany({
      data: (['ru', 'kk'] as const).map((locale) => ({ personId: row.id, locale, fullName: p.name[locale], lifeYearsText: years, translationStatus: 'reviewed' as const })),
    });
    const ids = personEntries(p).map((e) => {
      const found = dates.find((d) => d.calendarYear === e.calendarYear && d.translations[0]?.text === e.ru.text);
      if (!found) throw new Error(`Личности: запись календаря не найдена для ${p.slug}`);
      return found.id;
    });
    await db.personMemorableDate.deleteMany({ where: { personId: row.id } });
    await db.personMemorableDate.createMany({ data: ids.map((memorableDateId) => ({ personId: row.id, memorableDateId })) });
  }
}

async function seedCalendar(db: PrismaClient): Promise<void> {
  await db.memorableDate.deleteMany({ where: { dataOrigin: 'verified' } });
  for (const [i, e] of ARCHIVE_CALENDAR.entries()) {
    if (e.month !== null && (e.month < 1 || e.month > 12)) throw new Error(`Неверный месяц в календаре: ${e.ru.dateLabel}`);
    if (e.day !== null && (e.day < 1 || e.day > 31)) throw new Error(`Неверный день в календаре: ${e.ru.dateLabel}`);
    await db.memorableDate.create({
      data: {
        calendarYear: e.calendarYear, month: e.month, day: e.day, sortOrder: i,
        publicationStatus: 'published', dataOrigin: 'verified',
        translations: {
          create: [
            { locale: 'ru', ...e.ru, translationStatus: 'reviewed' },
            { locale: 'kk', ...e.kk, translationStatus: 'reviewed' },
          ],
        },
      },
    });
  }
}

const blocksText = (blocks: Array<HistoryBlock | InfoBlock>): string =>
  blocks.map((b) => {
    if (b.type === 'links') return b.items.map((l) => [l.label, l.note].filter(Boolean).join(' — ')).join('\n');
    if (b.type === 'table') return [b.head, ...b.rows].map((r) => r.filter(Boolean).join(' ')).join('\n');
    return 'items' in b ? b.items.join('\n') : b.text;
  }).join('\n\n');

/**
 * Справочные разделы по дополнению к ТЗ (услуги, законодательство, читальный зал, символы, ссылки).
 * Тело страницы — { actualizedAt, blocks }; незаполненное архивом помечено блоком «pending».
 */
async function seedInfoPages(db: PrismaClient): Promise<void> {
  for (const [i, p] of INFO_PAGES.entries()) {
    const data = { sortOrder: i, publicationStatus: 'published' as const, dataOrigin: 'verified' as const, sourceUrl: null };
    const page = await db.page.upsert({ where: { key: p.key }, update: data, create: { key: p.key, ...data } });
    await db.pageTranslation.deleteMany({ where: { pageId: page.id } });
    const texts: Tri<{ title: string; lead: string; body: { actualizedAt: string; blocks: InfoBlock[] }; bodyText: string }> = {
      ru: { title: p.title.ru, lead: p.lead.ru, body: { actualizedAt: p.actualizedAt, blocks: p.blocks.ru }, bodyText: blocksText(p.blocks.ru) },
      kk: { title: p.title.kk, lead: p.lead.kk, body: { actualizedAt: p.actualizedAt, blocks: p.blocks.kk }, bodyText: blocksText(p.blocks.kk) },
      en: { title: p.title.en, lead: p.lead.en, body: { actualizedAt: p.actualizedAt, blocks: p.blocks.en }, bodyText: blocksText(p.blocks.en) },
    };
    await db.pageTranslation.createMany({ data: translationRows(texts).map((t) => ({ ...t, pageId: page.id })) });
  }
}

/** «Противодействие коррупции»: тексты на русском и казахском, комплаенс-офицер и документы (PDF) в site_settings. */
async function seedAnticorruption(db: PrismaClient): Promise<void> {
  const data = { sortOrder: 0, publicationStatus: 'published' as const, dataOrigin: 'verified' as const, sourceUrl: null };
  const page = await db.page.upsert({ where: { key: 'anticorruption' }, update: data, create: { key: 'anticorruption', ...data } });
  await db.pageTranslation.deleteMany({ where: { pageId: page.id } });
  await db.pageTranslation.createMany({
    data: (['ru', 'kk'] as const).map((locale) => ({
      pageId: page.id,
      locale,
      title: locale === 'ru' ? 'Противодействие коррупции' : 'Сыбайлас жемқорлыққа қарсы іс-қимыл',
      body: ANTICORRUPTION_TEXT[locale],
      bodyText: blocksText(ANTICORRUPTION_TEXT[locale]),
      translationStatus: 'reviewed' as const,
    })),
  });
  await db.siteSetting.upsert({
    where: { key: 'anticorruption' },
    update: { value: ANTICORRUPTION_SETTING },
    create: { key: 'anticorruption', value: ANTICORRUPTION_SETTING },
  });
}
