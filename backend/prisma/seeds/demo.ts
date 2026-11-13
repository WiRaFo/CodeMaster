import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { ObjectStorage } from '../../src/infrastructure/storage/local-storage.ts';
import type { Tri } from './lib.ts';

/**
 * Демонстрационные материалы для показа разделов (docs/database-design.md §10).
 * Все записи data_origin = demo; на сайте без пометок (решение заказчика 11.11.2026). Тексты объясняют работу сайта
 * и не содержат исторических утверждений, которые можно принять за архивные факты.
 */

const LOCALES = ['ru', 'kk', 'en'] as const;
type Loc = (typeof LOCALES)[number];
const statusFor = (locale: Loc) => (locale === 'ru' ? 'reviewed' : 'machine') as 'reviewed' | 'machine';
const title = (t: Tri<string>, locale: Loc) => t[locale];

const DEMO_SOURCE = 'Материал команды разработки сайта.';

interface TextSeed {
  slug: string;
  title: Tri<string>;
  lead: Tri<string>;
  body: Tri<string>;
}

const PUBLICATIONS: Array<TextSeed & { topic: string; settlements?: string[] }> = [
  {
    slug: 'demo-how-to-read-archive-code',
    topic: 'region',
    title: { ru: 'Как читать архивный шифр', kk: 'Мұрағаттық шифрды қалай оқуға болады', en: 'How to read an archival reference code' },
    lead: {
      ru: 'Шифр указывает фонд, опись, дело и листы. По нему документ находят в хранилище.',
      kk: 'Шифр қорды, тізбені, істі және парақтарды көрсетеді. Құжат қоймадан осы арқылы табылады.',
      en: 'The code names the fond, inventory, file and folios, which is how a document is located in storage.',
    },
    body: {
      ru: 'Запись вида «Ф. 12. Оп. 3. Д. 45. Л. 1–12» означает: фонд 12, опись 3, дело 45, листы с 1 по 12. Буква перед номером фонда обозначает часть архива.',
      kk: '«Қ. 12. Тізб. 3. Іс 45. П. 1–12» жазбасы: 12-қор, 3-тізбе, 45-іс, 1–12 парақтар дегенді білдіреді.',
      en: 'A reference such as “F. 12. Inv. 3. File 45. Fol. 1–12” means fond 12, inventory 3, file 45, folios 1 to 12.',
    },
  },
  {
    slug: 'demo-reading-room-visit',
    topic: 'family',
    // Читальный зал основного архива находится в Усть-Каменогорске.
    settlements: ['ust-kamenogorsk'],
    title: { ru: 'Как подготовиться к работе в читальном зале', kk: 'Оқу залында жұмысқа қалай дайындалу керек', en: 'Preparing for a reading room visit' },
    lead: {
      ru: 'Найдите документы в каталоге заранее и выпишите их шифры.',
      kk: 'Құжаттарды каталогтан алдын ала тауып, шифрларын жазып алыңыз.',
      en: 'Find documents in the catalogue in advance and note their reference codes.',
    },
    body: {
      ru: 'Каталог показывает, какие документы открыты, а какие доступны только в читальном зале. Условия доступа указаны в карточке документа.',
      kk: 'Каталог қай құжаттардың ашық екенін, қайсысы тек оқу залында қолжетімді екенін көрсетеді.',
      en: 'The catalogue shows which documents are open and which are available only in the reading room.',
    },
  },
];

const NEWS: Array<TextSeed & { daysAgo: number }> = [
  {
    slug: 'demo-new-site-prototype',
    daysAgo: 1,
    title: { ru: 'Прототип нового сайта архива', kk: 'Мұрағаттың жаңа сайтының прототипі', en: 'Prototype of the new archive website' },
    lead: {
      ru: 'Архив готовит новый сайт: каталог, выставки и цифровая история региона в одном месте.',
      kk: 'Мұрағат жаңа сайт дайындап жатыр: каталог, көрмелер және өңірдің цифрлық тарихы бір жерде.',
      en: 'The archive is preparing a new website: the catalogue, exhibitions and the region’s digital history in one place.',
    },
    body: {
      ru: 'На сайте можно искать документы в электронном каталоге, смотреть виртуальные выставки и узнавать адреса и режим работы архива и филиалов.',
      kk: 'Сайтта электрондық каталогтан құжат іздеуге, виртуалды көрмелерді көруге және мұрағат пен филиалдардың мекенжайлары мен жұмыс уақытын білуге болады.',
      en: 'On the website you can search the e-catalogue, view virtual exhibitions and find the addresses and opening hours of the archive and its branches.',
    },
  },
  {
    slug: 'demo-catalog-search',
    daysAgo: 3,
    title: { ru: 'Поиск по каталогу по шифру и словам', kk: 'Каталогтан шифр және сөз бойынша іздеу', en: 'Catalogue search by code and keywords' },
    lead: {
      ru: 'Документы можно найти по словам из названия или по архивному шифру.',
      kk: 'Құжаттарды атауындағы сөздер немесе мұрағаттық шифр бойынша табуға болады.',
      en: 'Documents can be found by words from the title or by reference code.',
    },
    body: {
      ru: 'В строку поиска можно ввести шифр, например «Ф. 12. Оп. 3», или слова из названия документа.',
      kk: 'Іздеу жолына шифрды немесе құжат атауындағы сөздерді енгізуге болады.',
      en: 'You can type a reference code or words from a document title into the search box.',
    },
  },
];


/**
 * Вопросы и ответы о работе сайта (ЭТАП 7). Только сведения о самом сайте, без фактов об архиве,
 * которые нужно сверять; помечены как демо, пока архив не утвердит формулировки.
 */
const FAQ: Array<{ q: Tri<string>; a: Tri<string> }> = [
  {
    q: { ru: 'Можно ли подать заявление или заказать архивную справку через сайт?', kk: 'Сайт арқылы өтініш беруге немесе мұрағаттық анықтамаға тапсырыс беруге бола ма?', en: 'Can I submit an application or order an archive certificate on this website?' },
    a: {
      ru: 'Нет. Сайт носит информационно-справочный характер: заявления, запросы, заказы и оплата через него не принимаются. Адреса и телефоны архива — в разделе «Филиалы и контакты».',
      kk: 'Жоқ. Сайт ақпараттық-анықтамалық сипатта: өтініштер, сұраулар, тапсырыстар мен төлемдер ол арқылы қабылданбайды. Мұрағаттың мекенжайлары мен телефондары — «Филиалдар мен байланыс» бөлімінде.',
      en: 'No. This website is for information only: it does not accept applications, requests, orders or payments. The archive’s addresses and phone numbers are in “Branches and contacts”.',
    },
  },
  {
    q: { ru: 'Как найти документ по архивному шифру?', kk: 'Құжатты мұрағаттық шифр бойынша қалай табуға болады?', en: 'How do I find a document by its reference code?' },
    a: {
      ru: 'Введите шифр в строку поиска каталога, например «Ф. 12. Оп. 3. Д. 45». Каталог распознаёт шифр и покажет соответствующую запись, если она опубликована.',
      kk: 'Шифрды каталогтың іздеу жолына енгізіңіз, мысалы «Қ. 12. Тізб. 3. Іс 45». Каталог шифрды таниды және жазба жарияланған болса, оны көрсетеді.',
      en: 'Type the code into the catalog search box, for example “F. 12. Inv. 3. File 45”. The catalog recognises the code and shows the record if it is published.',
    },
  },
  {
    q: { ru: 'Почему у документа нет цифровой копии?', kk: 'Неліктен құжаттың цифрлық көшірмесі жоқ?', en: 'Why is there no digital copy of a document?' },
    a: {
      ru: 'Копии публикуются только у открытых документов и только после проверки файла. Документы с ограниченным доступом показываются карточкой с условиями доступа, без копии и расшифровки.',
      kk: 'Көшірмелер тек ашық құжаттарда және файл тексерілгеннен кейін ғана жарияланады. Қолжетімділігі шектеулі құжаттар көшірмесіз және мәтінсіз, қолжетімділік шарттары бар карточкамен көрсетіледі.',
      en: 'Copies are published only for open documents and only after the file has been checked. Restricted documents are shown as a record card with access conditions, without a copy or transcription.',
    },
  },
  {
    q: { ru: 'Как увеличить шрифт или включить высокую контрастность?', kk: 'Қаріпті қалай үлкейтуге немесе жоғары контрастты қалай қосуға болады?', en: 'How do I enlarge the text or switch on high contrast?' },
    a: {
      ru: 'Нажмите кнопку «Версия для слабовидящих» в шапке сайта. Там можно выбрать крупный текст и цветовую схему; выбор сохраняется в браузере. Кнопка «Остановить анимацию» выключает движение на страницах.',
      kk: 'Сайттың жоғарғы жағындағы «Нашар көретіндерге арналған нұсқа» батырмасын басыңыз. Онда ірі мәтін мен түс схемасын таңдауға болады; таңдау браузерде сақталады. «Анимацияны тоқтату» батырмасы беттердегі қозғалысты өшіреді.',
      en: 'Press “Low-vision version” in the site header. There you can choose large text and a colour scheme; your choice is kept in the browser. The “Stop animation” button turns off motion on the pages.',
    },
  },
  {
    q: { ru: 'На каких языках работает сайт?', kk: 'Сайт қандай тілдерде жұмыс істейді?', en: 'Which languages is the website available in?' },
    a: {
      ru: 'На казахском, русском и английском. Язык переключается в шапке сайта; если материал ещё не переведён, рядом показывается пометка.',
      kk: 'Қазақ, орыс және ағылшын тілдерінде. Тіл сайттың жоғарғы жағында ауыстырылады; материал әлі аударылмаса, қасында белгі көрсетіледі.',
      en: 'Kazakh, Russian and English. Switch the language in the site header; if a text has not been translated yet, a note is shown next to it.',
    },
  },
];

export async function seedDemo(db: PrismaClient, storage: ObjectStorage): Promise<void> {
  const topics = new Map((await db.category.findMany({ where: { kind: 'history_topic' } })).map((c) => [c.slug, c.id]));
  const newsRubric = await db.category.findUnique({ where: { kind_slug: { kind: 'news_rubric', slug: 'news' } } });

  for (const p of PUBLICATIONS) {
    const data = {
      kind: 'article' as const,
      sourceNote: DEMO_SOURCE,
      authorship: 'Команда разработки',
      publishedAt: new Date(),
      publicationStatus: 'published' as const,
      dataOrigin: 'demo' as const,
    };
    const row = await db.publication.upsert({ where: { slug: p.slug }, update: data, create: { slug: p.slug, ...data } });
    await db.publicationTranslation.deleteMany({ where: { publicationId: row.id } });
    await db.publicationTranslation.createMany({
      data: LOCALES.map((locale) => ({
        publicationId: row.id,
        locale,
        title: title(p.title, locale),
        lead: p.lead[locale],
        bodyText: p.body[locale],
        translationStatus: statusFor(locale),
      })),
    });
    const categoryId = topics.get(p.topic);
    if (categoryId) {
      await db.publicationCategory.createMany({ data: [{ publicationId: row.id, categoryId }], skipDuplicates: true });
    }
    const settlementIds = (await db.settlement.findMany({ where: { slug: { in: p.settlements ?? [] } }, select: { id: true } })).map((x) => x.id);
    await db.publicationSettlement.createMany({ data: settlementIds.map((settlementId) => ({ publicationId: row.id, settlementId })), skipDuplicates: true });
  }

  // Вопросы без собственного ключа: демо-набор пересоздаётся целиком.
  await db.faqItem.deleteMany({ where: { dataOrigin: 'demo' } });
  // Темы по порядку вопросов: заявления, шифр, цифровая копия, доступность, языки.
  const faqTopics = ['services', 'catalog', 'access', 'site', 'site'] as const;
  for (const [i, f] of FAQ.entries()) {
    await db.faqItem.create({
      data: {
        topic: faqTopics[i] ?? 'site',
        sortOrder: i,
        publicationStatus: 'published',
        dataOrigin: 'demo',
        translations: { create: LOCALES.map((locale) => ({ locale, question: f.q[locale], answer: f.a[locale], translationStatus: statusFor(locale) })) },
      },
    });
  }

  for (const n of NEWS) {
    const data = {
      categoryId: newsRubric?.id ?? null,
      publishedAt: new Date(Date.now() - n.daysAgo * 86_400_000),
      publicationStatus: 'published' as const,
      dataOrigin: 'demo' as const,
    };
    const row = await db.news.upsert({ where: { slug: n.slug }, update: data, create: { slug: n.slug, ...data } });
    await db.newsTranslation.deleteMany({ where: { newsId: row.id } });
    await db.newsTranslation.createMany({
      data: LOCALES.map((locale) => ({
        newsId: row.id,
        locale,
        title: title(n.title, locale),
        lead: n.lead[locale],
        bodyText: n.body[locale],
        translationStatus: statusFor(locale),
      })),
    });
  }

  await seedDemoExhibitions(db, storage);
  await seedDemoCollections(db);
}

const DEMO_BUCKET = 'archive-demo';
const DEMO_ITEM_SOURCE: Tri<string> = {
  ru: 'Материал команды разработки сайта.',
  kk: 'Сайт әзірлеушілер тобының материалы.',
  en: 'Material from the website development team.',
};
const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 1000;

const xml = (text: string) => text.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] ?? ch);

/** Условное изображение экспоната без попытки изобразить архивный предмет. */
function demoImageSvg(heading: string, caption: string, hue: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" font-family="DejaVu Sans, Arial, sans-serif">
<rect width="100%" height="100%" fill="hsl(${hue} 35% 88%)"/>
<rect x="50" y="50" width="${IMAGE_WIDTH - 100}" height="${IMAGE_HEIGHT - 100}" fill="none" stroke="hsl(${hue} 30% 45%)" stroke-width="6" stroke-dasharray="24 16"/>
<text x="${IMAGE_WIDTH / 2}" y="500" font-size="60" font-weight="700" text-anchor="middle" fill="#222">${xml(heading)}</text>
<text x="${IMAGE_WIDTH / 2}" y="600" font-size="40" text-anchor="middle" fill="#333">${xml(caption)}</text>
</svg>
`;
}

interface DemoItem {
  title: Tri<string>;
  description: Tri<string>;
  alt?: Tri<string>;
  image?: { heading: string; caption: string; hue: number };
  /** Ключ синтетического документа (source_system_id), если экспонат ссылается на запись каталога. */
  document?: string;
}

interface DemoExhibition {
  slug: string;
  topic: string;
  yearFrom: number;
  yearTo: number;
  featured: boolean;
  title: Tri<string>;
  lead: Tri<string>;
  description: Tri<string>;
  items: DemoItem[];
}

const EXHIBITIONS: DemoExhibition[] = [
  {
    slug: 'demo-exhibition-example',
    topic: 'industry',
    yearFrom: 1946,
    yearTo: 1991,
    featured: true,
    title: { ru: 'Пример виртуальной выставки', kk: 'Виртуалды көрме үлгісі', en: 'Sample virtual exhibition' },
    lead: { ru: 'Показывает, как устроена страница выставки.', kk: 'Көрме бетінің құрылымын көрсетеді.', en: 'Shows how an exhibition page is laid out.' },
    description: {
      ru: 'Выставка состоит из экспонатов, которые идут по порядку. У каждого экспоната есть описание и источник; экспонат может ссылаться на карточку документа в электронном каталоге.',
      kk: 'Көрме ретімен орналасқан экспонаттардан тұрады. Әр экспонаттың сипаттамасы мен дереккөзі бар; экспонат электрондық каталогтағы құжат карточкасына сілтеме бере алады.',
      en: 'An exhibition is a sequence of exhibits. Each exhibit has a description and a source and may link to a document record in the e-catalogue.',
    },
    items: [
      {
        title: { ru: 'Экспонат с изображением', kk: 'Суреті бар экспонат', en: 'Exhibit with an image' },
        description: {
          ru: 'Изображение можно увеличить. Стрелки клавиатуры переключают экспонаты.',
          kk: 'Суретті үлкейтуге болады. Пернетақта көрсеткілері экспонаттарды ауыстырады.',
          en: 'The image can be enlarged. Arrow keys move between exhibits.',
        },
        alt: { ru: 'Изображение экспоната', kk: 'Экспонат суреті', en: 'Exhibit image' },
        image: { heading: 'Экспонат 1', caption: 'Изображение экспоната', hue: 200 },
      },
      {
        title: { ru: 'Экспонат со ссылкой на документ каталога', kk: 'Каталог құжатына сілтемесі бар экспонат', en: 'Exhibit linked to a catalogue document' },
        description: {
          ru: 'Экспонат показывает страницу синтетического документа и ведёт к его карточке с архивным шифром.',
          kk: 'Экспонат синтетикалық құжаттың бетін көрсетеді және мұрағаттық шифры бар карточкасына апарады.',
          en: 'The exhibit shows a page of a synthetic document and links to its record with the reference code.',
        },
        alt: { ru: 'Страница синтетического документа с пометкой «Тестовые данные»', kk: '«Сынақ деректері» белгісі бар синтетикалық құжат беті', en: 'Page of a synthetic document marked “Test data”' },
        document: 'synthetic:TEST-1/1/1/1',
      },
      {
        title: { ru: 'Текстовый экспонат', kk: 'Мәтіндік экспонат', en: 'Text exhibit' },
        description: {
          ru: 'Экспонат может быть только текстом, например вступлением к разделу выставки.',
          kk: 'Экспонат тек мәтін болуы мүмкін, мысалы, көрме бөліміне кіріспе.',
          en: 'An exhibit can be text only, for example an introduction to a section of the exhibition.',
        },
      },
      {
        title: { ru: 'Последний экспонат', kk: 'Соңғы экспонат', en: 'Last exhibit' },
        description: {
          ru: 'После последнего экспоната можно вернуться к началу выставки.',
          kk: 'Соңғы экспонаттан кейін көрменің басына оралуға болады.',
          en: 'After the last exhibit you can return to the start of the exhibition.',
        },
        alt: { ru: 'Изображение экспоната', kk: 'Экспонат суреті', en: 'Exhibit image' },
        image: { heading: 'Экспонат 4', caption: 'Изображение экспоната', hue: 30 },
      },
    ],
  },
  {
    slug: 'demo-exhibition-culture',
    topic: 'culture_art',
    yearFrom: 1920,
    yearTo: 1940,
    featured: false,
    title: { ru: 'Пример тематической подборки', kk: 'Тақырыптық іріктеме үлгісі', en: 'Sample themed selection' },
    lead: { ru: 'Вторая выставка нужна, чтобы показать фильтр по тематике и периоду.', kk: 'Екінші көрме тақырып пен кезең бойынша сүзгіні көрсету үшін қажет.', en: 'A second exhibition demonstrates filtering by topic and period.' },
    description: {
      ru: 'Подборка из двух экспонатов.',
      kk: 'Екі экспонаттан тұратын іріктеме.',
      en: 'A selection of two exhibits.',
    },
    items: [
      {
        title: { ru: 'Первый экспонат подборки', kk: 'Іріктеменің бірінші экспонаты', en: 'First exhibit of the selection' },
        description: { ru: 'Условное изображение.', kk: 'Шартты сурет.', en: 'Placeholder image.' },
        alt: { ru: 'Изображение экспоната', kk: 'Экспонат суреті', en: 'Exhibit image' },
        image: { heading: 'Подборка', caption: 'Экспонат 1', hue: 120 },
      },
      {
        title: { ru: 'Второй экспонат подборки', kk: 'Іріктеменің екінші экспонаты', en: 'Second exhibit of the selection' },
        description: { ru: 'Текстовый экспонат.', kk: 'Мәтіндік экспонат.', en: 'Text exhibit.' },
      },
    ],
  },
];

/** ЭТАП 8: демонстрационные выставки (ТЗ §5.7, с. 9). Изображения условные. */
async function seedDemoExhibitions(db: PrismaClient, storage: ObjectStorage): Promise<void> {
  for (const ex of EXHIBITIONS) {
    const topic = await db.category.findUnique({ where: { kind_slug: { kind: 'exhibition_topic', slug: ex.topic } } });
    const base = { yearFrom: ex.yearFrom, yearTo: ex.yearTo, isFeatured: ex.featured, publicationStatus: 'published' as const, dataOrigin: 'demo' as const };
    const exhibition = await db.exhibition.upsert({ where: { slug: ex.slug }, update: base, create: { slug: ex.slug, ...base } });
    await db.exhibitionTranslation.deleteMany({ where: { exhibitionId: exhibition.id } });
    await db.exhibitionTranslation.createMany({
      data: LOCALES.map((locale) => ({
        exhibitionId: exhibition.id,
        locale,
        title: title(ex.title, locale),
        lead: ex.lead[locale],
        description: ex.description[locale],
        translationStatus: statusFor(locale),
      })),
    });
    await db.exhibitionCategory.deleteMany({ where: { exhibitionId: exhibition.id } });
    if (topic) await db.exhibitionCategory.create({ data: { exhibitionId: exhibition.id, categoryId: topic.id } });

    await db.exhibitionItem.deleteMany({ where: { exhibitionId: exhibition.id } });
    for (const [index, item] of ex.items.entries()) {
      let assetId: string | null = null;
      let documentId: string | null = null;
      if (item.image) {
        const svg = demoImageSvg(item.image.heading, item.image.caption, item.image.hue);
        const storageKey = `exhibitions/${ex.slug}/item-${index + 1}.svg`;
        await storage.write(DEMO_BUCKET, storageKey, svg);
        const data = {
          kind: 'image' as const,
          originalFilename: `item-${index + 1}.svg`,
          mimeType: 'image/svg+xml',
          sizeBytes: BigInt(Buffer.byteLength(svg)),
          sha256: createHash('sha256').update(svg).digest('hex'),
          width: IMAGE_WIDTH,
          height: IMAGE_HEIGHT,
          accessLevel: 'open' as const,
          processingStatus: 'ready' as const,
          antivirusStatus: 'clean' as const,
          dataOrigin: 'demo' as const,
          sourceNote: DEMO_SOURCE,
        };
        const asset = await db.digitalAsset.upsert({
          where: { storageBucket_storageKey: { storageBucket: DEMO_BUCKET, storageKey } },
          update: data,
          create: { storageBucket: DEMO_BUCKET, storageKey, ...data },
        });
        assetId = asset.id;
      }
      if (item.document) {
        // Ссылка на синтетический документ есть, только если загружен набор synthetic.
        const doc = await db.document.findFirst({ where: { sourceSystemId: item.document }, select: { id: true, assets: { orderBy: { pageNumber: 'asc' }, take: 1, select: { assetId: true } } } });
        documentId = doc?.id ?? null;
        assetId = doc?.assets[0]?.assetId ?? null;
      }
      const row = await db.exhibitionItem.create({ data: { exhibitionId: exhibition.id, sortOrder: (index + 1) * 10, assetId, documentId } });
      await db.exhibitionItemTranslation.createMany({
        data: LOCALES.map((locale) => ({
          itemId: row.id,
          locale,
          title: item.title[locale],
          description: item.description[locale],
          sourceNote: DEMO_ITEM_SOURCE[locale],
          altText: item.alt?.[locale] ?? null,
          translationStatus: statusFor(locale),
        })),
      });
    }
  }
}

/**
 * Демо-коллекции «Архива памяти» (F-081): показывают механизм подборки. Состав подборки — демонстрационный,
 * элементы — существующие записи: синтетические документы (если загружен набор synthetic) и личности из календаря архива.
 * Закрытый документ включён намеренно: сайт обязан его не показать.
 */
const COLLECTIONS: Array<{ slug: string; title: Tri<string>; description: Tri<string>; documents: string[]; persons: string[] }> = [
  {
    slug: 'demo-creamery-records',
    title: { ru: 'Маслозавод в документах', kk: 'Май зауыты құжаттарда', en: 'The creamery in documents' },
    description: {
      ru: 'Пример подборки документов одного фонда: протокол, личные дела и фотография. Документы синтетические.',
      kk: 'Бір қор құжаттарының іріктемесіне мысал: хаттама, жеке істер және фотосурет. Құжаттар синтетикалық.',
      en: 'An example selection from one fond: minutes, personnel files and a photograph. The documents are synthetic.',
    },
    documents: ['synthetic:TEST-1/1/1/1', 'synthetic:TEST-1/1/1/2', 'synthetic:TEST-1/1/1/3', 'synthetic:TEST-1/1/1/5'],
    persons: [],
  },
  {
    slug: 'demo-local-historians',
    title: { ru: 'Краеведы в календаре памятных дат', kk: 'Атаулы күндер күнтізбесіндегі өлкетанушылар', en: 'Local historians in the calendar of memorable dates' },
    description: {
      ru: 'Пример подборки личностей: люди, которых календарь памятных дат архива называет краеведами.',
      kk: 'Тұлғалар іріктемесіне мысал: мұрағаттың атаулы күндер күнтізбесі өлкетанушы деп атаған адамдар.',
      en: 'An example selection of people whom the archive’s calendar of memorable dates describes as local historians.',
    },
    documents: [],
    persons: ['pankratyev-dmitry', 'gerasimov-boris', 'kharlamov-prokofy'],
  },
];

async function seedDemoCollections(db: PrismaClient): Promise<void> {
  for (const [i, c] of COLLECTIONS.entries()) {
    const data = { sortOrder: i, isFeatured: i === 0, publicationStatus: 'published' as const, dataOrigin: 'demo' as const };
    const row = await db.collection.upsert({ where: { slug: c.slug }, update: data, create: { slug: c.slug, ...data } });
    await db.collectionTranslation.deleteMany({ where: { collectionId: row.id } });
    await db.collectionTranslation.createMany({
      data: LOCALES.map((locale) => ({ collectionId: row.id, locale, title: title(c.title, locale), description: c.description[locale], translationStatus: statusFor(locale) })),
    });
    const docs = await db.document.findMany({ where: { sourceSystemId: { in: c.documents } }, select: { id: true, sourceSystemId: true } });
    const persons = await db.historicalPerson.findMany({ where: { slug: { in: c.persons } }, select: { id: true, slug: true } });
    const items = [
      ...c.documents.flatMap((key) => docs.filter((d) => d.sourceSystemId === key).map((d) => ({ itemType: 'document' as const, itemId: d.id }))),
      ...c.persons.flatMap((slug) => persons.filter((p) => p.slug === slug).map((p) => ({ itemType: 'person' as const, itemId: p.id }))),
    ];
    await db.collectionItem.deleteMany({ where: { collectionId: row.id } });
    await db.collectionItem.createMany({ data: items.map((it, sortOrder) => ({ ...it, sortOrder, collectionId: row.id })) });
  }
}
