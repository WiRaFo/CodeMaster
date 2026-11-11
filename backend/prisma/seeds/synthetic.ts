import type { AccessLevel, AntivirusStatus, PrismaClient, PublicationStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { ObjectStorage } from '../../src/infrastructure/storage/local-storage.ts';
import type { Tri } from './lib.ts';

/**
 * Синтетический каталог для разработки и тестов доступа (docs/database-design.md §10).
 * Номера фондов начинаются с TEST-; это не реальные архивные шифры.
 * Набор покрывает все сочетания, которые проверяют тесты публичных представлений:
 * открытые, ограниченные и закрытые записи на разных уровнях, неопубликованных предков, копии без проверки.
 * Ключ каждой записи хранится в source_system_id (synthetic:фонд/опись/дело/документ).
 */

interface DocSeed {
  number: string;
  access: AccessLevel;
  status?: PublicationStatus;
  type?: 'historical_document' | 'photo' | 'organization_record';
  year: number;
  title: Tri<string>;
  description?: Tri<string>;
  accessConditions?: Tri<string>;
  /** Расшифровка. У ограниченных документов она не публикуется и не участвует в поиске (тест ЭТАПА 2). */
  transcription?: Tri<string>;
  /** Цифровая копия: pages страниц (по умолчанию 1); antivirus по умолчанию clean. */
  copy?: { antivirus?: AntivirusStatus; pages?: number };
  /** slug населённых пунктов и тематик (для фасетов каталога, ЭТАП 5). */
  settlements?: string[];
  topics?: string[];
  /** Автор или составитель (свободный текст) и slug организации из ORGANIZATIONS (фильтры F-034). */
  author?: string;
  organization?: string;
}

interface CaseSeed {
  number: string;
  access: AccessLevel;
  status?: PublicationStatus;
  sheets: number;
  title: Tri<string>;
  docs: DocSeed[];
}

interface FondSeed {
  number: string;
  /** Документы организаций (по умолчанию) или личного происхождения (ТЗ §5.3; дополнение к ТЗ §2 «Личные фонды»). */
  kind?: 'organization' | 'personal';
  branch: string;
  access: AccessLevel;
  status?: PublicationStatus;
  title: Tri<string>;
  inventory: { number: string; access: AccessLevel; status?: PublicationStatus };
  cases: CaseSeed[];
}

const tri = (ru: string, kk: string, en: string): Tri<string> => ({ ru, kk, en });

const RESTRICTED_CONDITIONS = tri(
  'Документ содержит персональные данные. Ознакомление в читальном зале по письменному запросу; цифровая копия не публикуется.',
  'Құжатта дербес деректер бар. Оқу залында жазбаша сұрау бойынша танысуға болады; цифрлық көшірме жарияланбайды.',
  'Contains personal data. Available in the reading room on written request; no digital copy is published.',
);

/** Синтетические организации-фондообразователи. Не реальные предприятия. */
const ORGANIZATIONS: Array<{ slug: string; name: Tri<string> }> = [
  { slug: 'synthetic-creamery', name: tri('Маслозавод', 'Май зауыты', 'Creamery') },
];

const FONDS: FondSeed[] = [
  {
    number: 'TEST-1',
    branch: 'main',
    access: 'open',
    title: tri('Маслозавод', 'Май зауыты', 'Creamery'),
    inventory: { number: '1', access: 'open' },
    cases: [
      {
        number: '1',
        access: 'open',
        sheets: 24,
        title: tri('Протоколы заседаний правления', 'Басқарма отырыстарының хаттамалары', 'Board meeting minutes'),
        docs: [
          {
            number: '1',
            access: 'open',
            year: 1956,
            settlements: ['ust-kamenogorsk'],
            topics: ['industry'],
            type: 'organization_record',
            author: 'Тестов Т. Т., секретарь правления',
            organization: 'synthetic-creamery',
            title: tri('Протокол заседания правления маслозавода', 'Май зауыты басқармасы отырысының хаттамасы', 'Minutes of the creamery board meeting'),
            description: tri(
              'Обсуждение плана выпуска сливочного масла и ремонта цеха.',
              'Сары май шығару жоспары мен цехты жөндеуді талқылау. Мұрағат құжаттары.',
              'Discussion of the butter production plan and workshop repairs.',
            ),
            transcription: tri('Слушали: о ремонте сепаратора.', 'Тыңдалды: сепараторды жөндеу туралы.', 'Heard: on the separator repair.'),
            copy: { pages: 3 },
          },
          {
            number: '2',
            access: 'restricted',
            year: 1957,
            settlements: ['ust-kamenogorsk'],
            topics: ['people'],
            organization: 'synthetic-creamery',
            title: tri('Личные дела работников маслозавода', 'Май зауыты қызметкерлерінің жеке істері', 'Personnel files of creamery workers'),
            accessConditions: RESTRICTED_CONDITIONS,
            transcription: tri(
              'Ведомость начисления заработной платы работникам цеха.',
              'Цех қызметкерлеріне жалақы есептеу ведомосі.',
              'Payroll ledger for workshop employees.',
            ),
            copy: {},
          },
          {
            number: '3',
            access: 'closed',
            year: 1958,
            settlements: ['ridder'],
            topics: ['military'],
            author: 'Закрытов З. З.',
            organization: 'synthetic-creamery',
            title: tri('Закрытый документ (не должен появляться публично)', 'Жабық құжат (жарияланбауы тиіс)', 'Closed document (must never be public)'),
            description: tri('Служебная переписка о проверке.', 'Тексеру туралы қызметтік хат алмасу.', 'Internal correspondence about an inspection.'),
          },
          {
            number: '4',
            access: 'open',
            status: 'draft',
            year: 1959,
            title: tri('Черновик описания документа', 'Құжат сипаттамасының жобасы', 'Draft document description'),
          },
          {
            number: '5',
            access: 'open',
            year: 1960,
            settlements: ['ust-kamenogorsk'],
            topics: ['industry'],
            type: 'photo',
            author: 'Фотографов Ф. Ф.',
            title: tri('Фотография коллектива маслозавода', 'Май зауыты ұжымының фотосуреті', 'Photograph of the creamery staff'),
            copy: { antivirus: 'pending' },
          },
        ],
      },
      {
        number: '2',
        access: 'closed',
        sheets: 10,
        title: tri('Закрытое дело', 'Жабық іс', 'Closed file'),
        docs: [{ number: '1', access: 'open', year: 1961, title: tri('Открытый документ в закрытом деле', 'Жабық істегі ашық құжат', 'Open document in a closed file') }],
      },
      {
        number: '3',
        access: 'open',
        status: 'draft',
        sheets: 5,
        title: tri('Неопубликованное дело', 'Жарияланбаған іс', 'Unpublished file'),
        docs: [{ number: '1', access: 'open', year: 1962, title: tri('Документ в неопубликованном деле', 'Жарияланбаған істегі құжат', 'Document in an unpublished file') }],
      },
    ],
  },
  {
    number: 'TEST-2',
    branch: 'main',
    access: 'restricted',
    title: tri('Фонд с ограниченным доступом', 'Қолжетімділігі шектеулі қор', 'Restricted fond'),
    inventory: { number: '1', access: 'open' },
    cases: [
      {
        number: '1',
        access: 'open',
        sheets: 3,
        title: tri('Дело в ограниченном фонде', 'Шектеулі қордағы іс', 'File in a restricted fond'),
        docs: [
          {
            number: '1',
            access: 'open',
            year: 1970,
            settlements: ['ridder'],
            topics: ['family'],
            title: tri('Открытый документ в ограниченном фонде', 'Шектеулі қордағы ашық құжат', 'Open document in a restricted fond'),
            accessConditions: RESTRICTED_CONDITIONS,
            copy: {},
          },
        ],
      },
    ],
  },
  {
    number: 'TEST-3',
    branch: 'main',
    access: 'closed',
    title: tri('Закрытый фонд', 'Жабық қор', 'Closed fond'),
    inventory: { number: '1', access: 'open' },
    cases: [
      {
        number: '1',
        access: 'open',
        sheets: 2,
        title: tri('Дело в закрытом фонде', 'Жабық қордағы іс', 'File in a closed fond'),
        docs: [{ number: '1', access: 'open', year: 1980, title: tri('Документ в закрытом фонде', 'Жабық қордағы құжат', 'Document in a closed fond') }],
      },
    ],
  },
  {
    number: 'TEST-4',
    branch: 'synthetic-draft',
    access: 'open',
    title: tri('Фонд неопубликованного подразделения', 'Жарияланбаған бөлімше қоры', 'Fond of an unpublished branch'),
    inventory: { number: '1', access: 'open' },
    cases: [
      {
        number: '1',
        access: 'open',
        sheets: 1,
        title: tri('Дело', 'Іс', 'File'),
        docs: [{ number: '1', access: 'open', year: 1990, title: tri('Документ неопубликованного подразделения', 'Жарияланбаған бөлімше құжаты', 'Document of an unpublished branch') }],
      },
    ],
  },
  {
    // Пример личного фонда для перехода «Личные фонды»: без документов, чтобы не менять выдачу каталога.
    number: 'TEST-5',
    kind: 'personal',
    branch: 'main',
    access: 'open',
    title: tri('Личный фонд краеведа', 'Өлкетанушының жеке қоры', 'Personal fond of a local historian'),
    inventory: { number: '1', access: 'open' },
    cases: [{ number: '1', access: 'open', sheets: 12, title: tri('Рукописи и заметки', 'Қолжазбалар мен жазбалар', 'Manuscripts and notes'), docs: [] }],
  },
];

/** Заголовки без пометок на сайте (решение заказчика 11.11.2026); синтетику выдаёт dataOrigin и шифры TEST-. */
const prefixed = (t: Tri<string>): Tri<string> => t;

const LOCALES = ['ru', 'kk', 'en'] as const;
const SYNTHETIC_BUCKET = 'archive-synthetic';
const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;

const xml = (text: string) => text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * Изображение синтетической страницы: лист с названием, шифром и текстом (без пометок на сайте, решение
 * заказчика 11.11.2026). Нужен, чтобы просмотрщик можно было проверить без настоящих сканов.
 */
function syntheticPageSvg(code: string, page: number, pages: number, title: string, text?: string): string {
  const lines = (text ?? 'Текст страницы отсутствует.').match(/.{1,48}(\s|$)/g) ?? [];
  const body = lines
    .map((line, i) => `<text x="120" y="${560 + i * 64}" font-size="40" fill="#2b2b2b">${xml(line.trim())}</text>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" font-family="DejaVu Serif, Georgia, serif">
<rect width="100%" height="100%" fill="#f4ecd8"/>
<rect x="60" y="60" width="${PAGE_WIDTH - 120}" height="${PAGE_HEIGHT - 120}" fill="none" stroke="#b9a77f" stroke-width="4"/>
<text x="120" y="380" font-size="44" font-weight="700" fill="#2b2b2b"${title.length > 40 ? ` textLength="${PAGE_WIDTH - 240}" lengthAdjust="spacingAndGlyphs"` : ''}>${xml(title)}</text>
<text x="120" y="450" font-size="34" fill="#5a4a2a">${xml(code)} · Л. ${page}</text>
${body}
<text x="${PAGE_WIDTH / 2}" y="${PAGE_HEIGHT - 120}" font-size="34" text-anchor="middle" fill="#5a4a2a">— ${page} / ${pages} —</text>
</svg>
`;
}
const statusFor = (locale: (typeof LOCALES)[number]) => (locale === 'ru' ? 'reviewed' : 'machine') as 'reviewed' | 'machine';

export async function seedSynthetic(db: PrismaClient, storage: ObjectStorage): Promise<void> {
  const branchType = await db.branchType.findUnique({ where: { code: 'branch' } });
  if (!branchType) throw new Error('Нет справочника типов подразделений; сначала запустите справочники');
  const draftBranch = await db.branch.upsert({
    where: { slug: 'synthetic-draft' },
    update: {},
    create: { slug: 'synthetic-draft', branchTypeId: branchType.id, showOnMap: false, publicationStatus: 'draft', dataOrigin: 'synthetic' },
  });
  await db.branchTranslation.createMany({
    data: LOCALES.map((locale) => ({
      branchId: draftBranch.id,
      locale,
      fullName: prefixed(tri('Неопубликованное подразделение', 'Жарияланбаған бөлімше', 'Unpublished branch'))[locale],
      translationStatus: statusFor(locale),
    })),
    skipDuplicates: true,
  });

  const branchIds = new Map((await db.branch.findMany({ select: { id: true, slug: true } })).map((b) => [b.slug, b.id]));
  const typeIds = new Map((await db.documentType.findMany()).map((t) => [t.code, t.id]));
  const periods = await db.historicalPeriod.findMany();
  const periodFor = (year: number) =>
    periods.find((p) => (p.yearFrom === null || p.yearFrom <= year) && (p.yearTo === null || year <= p.yearTo))?.id ?? null;
  const settlementIds = new Map((await db.settlement.findMany({ select: { id: true, slug: true } })).map((x) => [x.slug, x.id]));
  const topicIds = new Map(
    (await db.category.findMany({ where: { kind: 'history_topic' }, select: { id: true, slug: true } })).map((x) => [x.slug, x.id]),
  );
  const organizationIds = new Map<string, string>();
  for (const o of ORGANIZATIONS) {
    const org = await db.organization.upsert({ where: { slug: o.slug }, update: {}, create: { slug: o.slug } });
    await db.organizationTranslation.deleteMany({ where: { organizationId: org.id } });
    await db.organizationTranslation.createMany({
      data: LOCALES.map((locale) => ({ organizationId: org.id, locale, name: prefixed(o.name)[locale], translationStatus: statusFor(locale) })),
    });
    organizationIds.set(o.slug, org.id);
  }
  const need = (map: Map<string, string>, key: string) => {
    const id = map.get(key);
    if (!id) throw new Error(`Нет справочной записи ${key}; сначала запустите справочники и набор migrated`);
    return id;
  };

  for (const f of FONDS) {
    const branchId = branchIds.get(f.branch);
    if (!branchId) throw new Error(`Нет подразделения ${f.branch}; сначала запустите набор migrated`);
    const fondData = {
      fondKind: f.kind ?? 'organization',
      fondNumberSort: Number(f.number.replace(/\D/g, '')),
      accessLevel: f.access,
      publicationStatus: f.status ?? 'published',
      dataOrigin: 'synthetic' as const,
      sourceSystemId: `synthetic:${f.number}`,
    };
    const fond = await db.fond.upsert({
      where: { branchId_fondNumber: { branchId, fondNumber: f.number } },
      update: fondData,
      create: { branchId, fondNumber: f.number, ...fondData },
    });
    await db.fondTranslation.deleteMany({ where: { fondId: fond.id } });
    await db.fondTranslation.createMany({
      data: LOCALES.map((locale) => ({ fondId: fond.id, locale, title: prefixed(f.title)[locale], translationStatus: statusFor(locale) })),
    });

    const invKey = `${f.number}/${f.inventory.number}`;
    const invData = {
      accessLevel: f.inventory.access,
      publicationStatus: f.inventory.status ?? 'published',
      dataOrigin: 'synthetic' as const,
      sourceSystemId: `synthetic:${invKey}`,
    };
    const inventory = await db.inventory.upsert({
      where: { fondId_inventoryNumber: { fondId: fond.id, inventoryNumber: f.inventory.number } },
      update: invData,
      create: { fondId: fond.id, inventoryNumber: f.inventory.number, ...invData },
    });
    await db.inventoryTranslation.deleteMany({ where: { inventoryId: inventory.id } });
    await db.inventoryTranslation.createMany({
      data: LOCALES.map((locale) => ({
        inventoryId: inventory.id,
        locale,
        title: prefixed(tri('Опись дел постоянного хранения', 'Тұрақты сақталатын істер тізімдемесі', 'Inventory of permanent files'))[locale],
        translationStatus: statusFor(locale),
      })),
    });

    for (const c of f.cases) {
      const caseKey = `${invKey}/${c.number}`;
      const caseData = {
        sheetCount: c.sheets,
        accessLevel: c.access,
        publicationStatus: c.status ?? 'published',
        dataOrigin: 'synthetic' as const,
        sourceSystemId: `synthetic:${caseKey}`,
      };
      const caseRow = await db.case.upsert({
        where: { inventoryId_caseNumber: { inventoryId: inventory.id, caseNumber: c.number } },
        update: caseData,
        create: { inventoryId: inventory.id, caseNumber: c.number, ...caseData },
      });
      await db.caseTranslation.deleteMany({ where: { caseId: caseRow.id } });
      await db.caseTranslation.createMany({
        data: LOCALES.map((locale) => ({ caseId: caseRow.id, locale, title: prefixed(c.title)[locale], translationStatus: statusFor(locale) })),
      });

      for (const d of c.docs) {
        const docKey = `${caseKey}/${d.number}`;
        const documentTypeId = typeIds.get(d.type ?? 'historical_document');
        if (!documentTypeId) throw new Error('Нет справочника типов документов');
        const docData = {
          documentTypeId,
          dateFrom: new Date(Date.UTC(d.year, 0, 1)),
          dateTo: new Date(Date.UTC(d.year, 11, 31)),
          datePrecision: 'year' as const,
          periodId: periodFor(d.year),
          originalLanguages: ['ru'],
          authorText: d.author ?? null,
          organizationId: d.organization ? need(organizationIds, d.organization) : null,
          accessLevel: d.access,
          publicationStatus: d.status ?? 'published',
          dataOrigin: 'synthetic' as const,
          sourceNote: 'Синтетическая запись для разработки и тестов, не является архивным документом.',
          sourceSystemId: `synthetic:${docKey}`,
        };
        const doc = await db.document.upsert({
          where: { caseId_documentNumber: { caseId: caseRow.id, documentNumber: d.number } },
          update: docData,
          create: { caseId: caseRow.id, documentNumber: d.number, ...docData },
        });
        await db.documentTranslation.deleteMany({ where: { documentId: doc.id } });
        await db.documentTranslation.createMany({
          data: LOCALES.map((locale) => ({
            documentId: doc.id,
            locale,
            title: prefixed(d.title)[locale],
            description: d.description?.[locale] ?? null,
            transcription: d.transcription?.[locale] ?? null,
            accessConditions: d.accessConditions?.[locale] ?? null,
            translationStatus: statusFor(locale),
          })),
        });

        await db.documentSettlement.deleteMany({ where: { documentId: doc.id } });
        await db.documentSettlement.createMany({ data: (d.settlements ?? []).map((x) => ({ documentId: doc.id, settlementId: need(settlementIds, x) })) });
        await db.documentCategory.deleteMany({ where: { documentId: doc.id } });
        await db.documentCategory.createMany({ data: (d.topics ?? []).map((x) => ({ documentId: doc.id, categoryId: need(topicIds, x) })) });

        // Страницы пересоздаются при каждом запуске сида (раньше страницы были .jpg без файла).
        await db.documentAsset.deleteMany({ where: { documentId: doc.id } });
        if (d.copy) {
          const pageCount = d.copy.pages ?? 1;
          for (let page = 1; page <= pageCount; page++) {
            const storageKey = `synthetic/${docKey}/page-${page}.svg`;
            const svg = syntheticPageSvg(`Ф. ${f.number}. Оп. ${f.inventory.number}. Д. ${c.number}. Док. ${d.number}`, page, pageCount, d.title.ru, d.transcription?.ru);
            await storage.write(SYNTHETIC_BUCKET, storageKey, svg);
            const assetData = {
              kind: 'scan_page' as const,
              originalFilename: `page-${page}.svg`,
              mimeType: 'image/svg+xml',
              sizeBytes: BigInt(Buffer.byteLength(svg)),
              sha256: createHash('sha256').update(svg).digest('hex'),
              width: PAGE_WIDTH,
              height: PAGE_HEIGHT,
              accessLevel: 'open' as const,
              processingStatus: 'ready' as const,
              antivirusStatus: d.copy.antivirus ?? 'clean',
              dataOrigin: 'synthetic' as const,
              sourceNote: 'Синтетическое изображение страницы, сгенерировано сидом; не является сканом архивного документа.',
            };
            const asset = await db.digitalAsset.upsert({
              where: { storageBucket_storageKey: { storageBucket: SYNTHETIC_BUCKET, storageKey } },
              update: assetData,
              create: { storageBucket: SYNTHETIC_BUCKET, storageKey, ...assetData },
            });
            await db.documentAsset.createMany({
              data: [{ documentId: doc.id, assetId: asset.id, pageNumber: page, sheetLabel: String(page) }],
              skipDuplicates: true,
            });
            await db.assetTranslation.deleteMany({ where: { assetId: asset.id } });
            await db.assetTranslation.createMany({
              data: LOCALES.map((locale) => ({
                assetId: asset.id,
                locale,
                altText: {
                  ru: `Страница ${page} из ${pageCount}: «${d.title.ru}»`,
                  kk: `${pageCount} беттің ${page}-беті: «${d.title.kk}»`,
                  en: `Page ${page} of ${pageCount}: “${d.title.en}”`,
                }[locale],
                translationStatus: statusFor(locale),
              })),
            });
          }
        }
      }
    }
  }
  await db.digitalAsset.deleteMany({ where: { storageBucket: SYNTHETIC_BUCKET, documentPages: { none: {} } } });
}
