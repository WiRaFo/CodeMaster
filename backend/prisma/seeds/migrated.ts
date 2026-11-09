import type { PrismaClient } from '@prisma/client';
import { names, translationRows, OLD_SITE_CONTACTS_URL, OLD_SITE_URL, type Tri } from './lib.ts';

/**
 * Данные, перенесённые с текущего сайта по аудиту (source/site-audit/content-inventory.md, site-structure.md).
 * data_origin = migrated, verified_at = NULL: до сверки с архивом интерфейс показывает пометку «требует сверки»
 * (docs/requirements-matrix.md Q-22, Q-23). Координаты не заполняются и на карту записи не выводятся.
 * Почтовый индекс не заполнен: на старом сайте указаны два разных (070000 и 070004).
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
  phone?: string;
  email?: string;
  sourceUrl: string;
  sortOrder: number;
  texts: Tri<{ fullName: string; shortName: string; address?: string; scheduleText?: string; readingRoomSchedule?: string }>;
  office?: [string, string];
  readingRoom?: [string, string];
}

const READING_ROOM: Tri<string> = {
  ru: 'Читальный зал: пн–пт, 10:00–17:00',
  kk: 'Оқу залы: дс–жм, 10:00–17:00',
  en: 'Reading room: Mon–Fri, 10:00–17:00',
};

const branchName = (ru: string, kk: string, en: string, shortRu: string, shortKk: string, shortEn: string): BranchSeed['texts'] => ({
  ru: { fullName: ru, shortName: shortRu },
  kk: { fullName: kk, shortName: shortKk },
  en: { fullName: en, shortName: shortEn },
});

const BRANCHES: BranchSeed[] = [
  {
    slug: 'main',
    type: 'main_archive',
    isMain: true,
    settlement: 'ust-kamenogorsk',
    phone: '8 (7232) 25-59-76',
    email: 'arhiv-ukg@yandex.kz',
    sourceUrl: OLD_SITE_CONTACTS_URL,
    sortOrder: 0,
    texts: {
      ru: { fullName: 'Государственный архив Восточно-Казахстанской области', shortName: 'ГА ВКО', address: 'г. Усть-Каменогорск, ул. Головкова, 26/1', scheduleText: 'Пн–пт, 9:00–18:00', readingRoomSchedule: READING_ROOM.ru },
      kk: { fullName: 'Шығыс Қазақстан облысының мемлекеттік мұрағаты', shortName: 'ШҚО ММ', address: 'Өскемен қ., Головков к-сі, 26/1', scheduleText: 'Дс–жм, 9:00–18:00', readingRoomSchedule: READING_ROOM.kk },
      en: { fullName: 'State Archive of East Kazakhstan Region', shortName: 'SA EKR', address: '26/1 Golovkov St, Oskemen', scheduleText: 'Mon–Fri, 9:00–18:00', readingRoomSchedule: READING_ROOM.en },
    },
    office: ['09:00', '18:00'],
    readingRoom: ['10:00', '17:00'],
  },
  {
    slug: 'main-krylova',
    type: 'site',
    parent: 'main',
    settlement: 'ust-kamenogorsk',
    phone: '8 (7232) 25-13-47',
    sourceUrl: OLD_SITE_CONTACTS_URL,
    sortOrder: 1,
    texts: {
      ru: { fullName: 'Государственный архив ВКО, площадка на ул. Крылова', shortName: 'ул. Крылова, 39', address: 'г. Усть-Каменогорск, ул. Крылова, 39', readingRoomSchedule: READING_ROOM.ru },
      kk: { fullName: 'ШҚО мемлекеттік мұрағаты, Крылов көшесіндегі алаң', shortName: 'Крылов к-сі, 39', address: 'Өскемен қ., Крылов к-сі, 39', readingRoomSchedule: READING_ROOM.kk },
      en: { fullName: 'State Archive of EKR, Krylov Street site', shortName: '39 Krylov St', address: '39 Krylov St, Oskemen', readingRoomSchedule: READING_ROOM.en },
    },
    readingRoom: ['10:00', '17:00'],
  },
  {
    slug: 'ust-kamenogorsk-personnel',
    type: 'branch',
    parent: 'main',
    settlement: 'ust-kamenogorsk',
    sourceUrl: OLD_SITE_URL,
    sortOrder: 2,
    texts: branchName(
      'Филиал «Усть-Каменогорский по личному составу»', '«Өскемен — жеке құрам бойынша» филиалы', 'Oskemen personnel records branch',
      'Усть-Каменогорский по личному составу', 'Өскемен, жеке құрам бойынша', 'Oskemen (personnel)',
    ),
  },
  {
    slug: 'zaisan',
    type: 'branch',
    parent: 'main',
    settlement: 'zaisan',
    sourceUrl: OLD_SITE_URL,
    sortOrder: 3,
    texts: branchName('Зайсанский филиал', 'Зайсан филиалы', 'Zaisan branch', 'Зайсанский', 'Зайсан', 'Zaisan'),
  },
  {
    slug: 'ridder',
    type: 'branch',
    parent: 'main',
    settlement: 'ridder',
    sourceUrl: OLD_SITE_URL,
    sortOrder: 4,
    texts: branchName('Риддерский филиал', 'Риддер филиалы', 'Ridder branch', 'Риддерский', 'Риддер', 'Ridder'),
  },
  {
    slug: 'altai',
    type: 'branch',
    parent: 'main',
    settlement: 'altai',
    sourceUrl: OLD_SITE_URL,
    sortOrder: 5,
    texts: branchName('Филиал «Алтай»', '«Алтай» филиалы', 'Altai branch', 'Алтай', 'Алтай', 'Altai'),
  },
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
      phone: b.phone ?? null,
      email: b.email ?? null,
      showOnMap: false,
      sortOrder: b.sortOrder,
      verifiedAt: null,
      sourceUrl: b.sourceUrl,
      publicationStatus: 'published' as const,
      dataOrigin: 'migrated' as const,
    };
    const row = await db.branch.upsert({ where: { slug: b.slug }, update: data, create: { slug: b.slug, ...data } });
    branchIds.set(b.slug, row.id);

    await db.branchTranslation.deleteMany({ where: { branchId: row.id } });
    await db.branchTranslation.createMany({
      data: translationRows(b.texts).map((t) => ({ ...t, branchId: row.id, description: NEEDS_CHECK[t.locale] })),
    });

    await db.branchSchedule.deleteMany({ where: { branchId: row.id } });
    const hours = (kind: string, range: [string, string] | undefined) =>
      range ? WEEKDAYS.map((weekday) => ({ weekday, kind, opens: range[0], closes: range[1] })) : [];
    const schedule = [...hours('office', b.office), ...hours('reading_room', b.readingRoom)];
    await db.branchSchedule.createMany({ data: schedule.map((s) => ({ ...s, branchId: row.id })) });
  }
}
