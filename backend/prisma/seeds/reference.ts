import type { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS, SYSTEM_ROLES, ALL_PERMISSIONS, type SystemRole } from '@archive-vko/shared';
import { names, translationRows, type Tri } from './lib.ts';

const ROLE_NAMES: Record<SystemRole, Tri<string>> = {
  super_admin: { ru: 'Главный администратор', kk: 'Бас әкімші', en: 'Chief administrator' },
  site_admin: { ru: 'Администратор сайта', kk: 'Сайт әкімшісі', en: 'Site administrator' },
  editor: { ru: 'Редактор', kk: 'Редактор', en: 'Editor' },
  archivist: { ru: 'Сотрудник архива', kk: 'Мұрағат қызметкері', en: 'Archivist' },
  branch_admin: { ru: 'Администратор филиала', kk: 'Филиал әкімшісі', en: 'Branch administrator' },
  moderator: { ru: 'Модератор', kk: 'Модератор', en: 'Moderator' },
  analyst: { ru: 'Аналитик', kk: 'Талдаушы', en: 'Analyst' },
};

/** Категории каталога из ТЗ §5.3, с. 5 (кроме уровней иерархии «фонды/описи/дела», которые являются таблицами). */
const DOCUMENT_TYPES: Array<[string, Tri<{ name: string }>]> = [
  ['historical_document', names('Исторические документы', 'Тарихи құжаттар', 'Historical documents')],
  ['photo', names('Фотографии', 'Фотосуреттер', 'Photographs')],
  ['map_drawing', names('Карты и чертежи', 'Карталар мен сызбалар', 'Maps and drawings')],
  ['written_source', names('Письменные источники', 'Жазба деректер', 'Written sources')],
  ['organization_record', names('Документы организаций и предприятий', 'Ұйымдар мен кәсіпорындар құжаттары', 'Records of organisations and enterprises')],
  ['personal_record', names('Документы личного происхождения', 'Жеке тектік құжаттар', 'Personal papers')],
  ['audio_video', names('Аудио- и видеоматериалы', 'Аудио- және бейнематериалдар', 'Audio and video')],
];

/** Тематические направления «Большого архива памяти», ТЗ §5.6, с. 8. */
const HISTORY_TOPICS: Array<[string, Tri<{ name: string }>]> = [
  ['region', names('История Восточно-Казахстанской области', 'Шығыс Қазақстан облысының тарихы', 'History of East Kazakhstan Region')],
  ['settlements', names('История Усть-Каменогорска и других населённых пунктов', 'Өскемен және басқа елді мекендердің тарихы', 'History of Oskemen and other settlements')],
  ['industry', names('История промышленных предприятий', 'Өнеркәсіп кәсіпорындарының тарихы', 'History of industrial enterprises')],
  ['people', names('История известных личностей региона', 'Өңірдің белгілі тұлғаларының тарихы', 'Notable people of the region')],
  ['education_science', names('История образования и науки', 'Білім және ғылым тарихы', 'History of education and science')],
  ['culture_art', names('Культура и искусство', 'Мәдениет және өнер', 'Culture and art')],
  ['military', names('Военная история', 'Әскери тарих', 'Military history')],
  ['great_patriotic_war', names('История Великой Отечественной войны', 'Ұлы Отан соғысының тарихы', 'History of the Great Patriotic War')],
  ['family', names('История семьи и поколений', 'Отбасы және ұрпақтар тарихы', 'Family and generations')],
  ['public_organizations', names('История общественных организаций', 'Қоғамдық ұйымдардың тарихы', 'History of public organisations')],
  ['periods', names('История развития региона в разные исторические периоды', 'Өңірдің түрлі тарихи кезеңдердегі дамуы', 'The region across historical periods')],
];

const NEWS_RUBRICS: Array<[string, Tri<{ name: string }>]> = [
  ['news', names('Новости', 'Жаңалықтар', 'News')],
  ['announcements', names('Объявления', 'Хабарландырулар', 'Announcements')],
  ['events', names('Мероприятия', 'Іс-шаралар', 'Events')],
];

const PERIODS: Array<[string, number | null, number | null, Tri<{ name: string }>]> = [
  ['before-1917', null, 1916, names('До 1917 года', '1917 жылға дейін', 'Before 1917')],
  ['1917-1940', 1917, 1940, names('1917–1940 годы', '1917–1940 жылдар', '1917–1940')],
  ['1941-1945', 1941, 1945, names('1941–1945 годы', '1941–1945 жылдар', '1941–1945')],
  ['1946-1991', 1946, 1991, names('1946–1991 годы', '1946–1991 жылдар', '1946–1991')],
  ['since-1991', 1991, null, names('С 1991 года', '1991 жылдан бастап', 'Since 1991')],
];

const BRANCH_TYPES: Array<[string, Tri<{ name: string }>]> = [
  ['main_archive', names('Государственный архив', 'Мемлекеттік мұрағат', 'State archive')],
  ['site', names('Площадка архива', 'Мұрағат алаңы', 'Archive site')],
  ['branch', names('Филиал', 'Филиал', 'Branch')],
];

export async function seedReference(db: PrismaClient): Promise<void> {
  await db.localeSetting.createMany({
    data: [
      { code: 'kk', name: 'Қазақша', sortOrder: 0 },
      { code: 'ru', name: 'Русский', sortOrder: 1 },
      { code: 'en', name: 'English', sortOrder: 2 },
    ],
    skipDuplicates: true,
  });

  await db.permission.createMany({ data: ALL_PERMISSIONS.map((code) => ({ code })), skipDuplicates: true });
  const permissionIds = new Map((await db.permission.findMany()).map((p) => [p.code, p.id]));
  for (const code of SYSTEM_ROLES) {
    const label = ROLE_NAMES[code];
    const role = await db.role.upsert({
      where: { code },
      update: {},
      create: { code, nameRu: label.ru, nameKk: label.kk, nameEn: label.en, isSystem: true },
    });
    await db.rolePermission.createMany({
      data: ROLE_PERMISSIONS[code].map((perm) => {
        const permissionId = permissionIds.get(perm);
        if (!permissionId) throw new Error(`Нет права ${perm}`);
        return { roleId: role.id, permissionId };
      }),
      skipDuplicates: true,
    });
  }

  for (const [i, [code, texts]] of DOCUMENT_TYPES.entries()) {
    const row = await db.documentType.upsert({ where: { code }, update: {}, create: { code, sortOrder: i } });
    await db.documentTypeTranslation.createMany({
      data: translationRows(texts).map((t) => ({ ...t, documentTypeId: row.id })),
      skipDuplicates: true,
    });
  }

  for (const [kind, list] of [
    ['history_topic', HISTORY_TOPICS],
    ['news_rubric', NEWS_RUBRICS],
  ] as const) {
    for (const [i, [slug, texts]] of list.entries()) {
      const row = await db.category.upsert({
        where: { kind_slug: { kind, slug } },
        update: {},
        create: { kind, slug, sortOrder: i },
      });
      await db.categoryTranslation.createMany({
        data: translationRows(texts).map((t) => ({ ...t, categoryId: row.id })),
        skipDuplicates: true,
      });
    }
  }

  for (const [i, [slug, yearFrom, yearTo, texts]] of PERIODS.entries()) {
    const row = await db.historicalPeriod.upsert({ where: { slug }, update: {}, create: { slug, yearFrom, yearTo, sortOrder: i } });
    await db.historicalPeriodTranslation.createMany({
      data: translationRows(texts).map((t) => ({ ...t, periodId: row.id })),
      skipDuplicates: true,
    });
  }

  for (const [i, [code, texts]] of BRANCH_TYPES.entries()) {
    const row = await db.branchType.upsert({ where: { code }, update: {}, create: { code, sortOrder: i } });
    await db.branchTypeTranslation.createMany({
      data: translationRows(texts).map((t) => ({ ...t, branchTypeId: row.id })),
      skipDuplicates: true,
    });
  }
}
