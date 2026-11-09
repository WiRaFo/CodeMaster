import type { PrismaClient } from '@prisma/client';
import { DEMO_PREFIX, type Tri } from './lib.ts';

/**
 * Демонстрационные материалы для показа разделов (docs/database-design.md §10).
 * Все записи data_origin = demo и начинаются с «[Демо]». Тексты объясняют работу сайта
 * и не содержат исторических утверждений, которые можно принять за архивные факты.
 */

const LOCALES = ['ru', 'kk', 'en'] as const;
type Loc = (typeof LOCALES)[number];
const statusFor = (locale: Loc) => (locale === 'ru' ? 'reviewed' : 'machine') as 'reviewed' | 'machine';
const title = (t: Tri<string>, locale: Loc) => `${DEMO_PREFIX[locale]} ${t[locale]}`;

const DEMO_SOURCE = 'Демонстрационный материал команды разработки; не является архивной публикацией.';

interface TextSeed {
  slug: string;
  title: Tri<string>;
  lead: Tri<string>;
  body: Tri<string>;
}

const PUBLICATIONS: Array<TextSeed & { topic: string }> = [
  {
    slug: 'demo-how-to-read-archive-code',
    topic: 'region',
    title: { ru: 'Как читать архивный шифр', kk: 'Мұрағаттық шифрды қалай оқуға болады', en: 'How to read an archival reference code' },
    lead: {
      ru: 'Шифр указывает фонд, опись, дело и листы. По нему документ находят в хранилище.',
      kk: 'Шифр қорды, тізімдемені, істі және парақтарды көрсетеді. Құжат қоймадан осы арқылы табылады.',
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
      ru: 'Демонстрационная новость: так будет выглядеть лента новостей.',
      kk: 'Демонстрациялық жаңалық: жаңалықтар таспасы осылай көрінеді.',
      en: 'A demo item showing how the news feed will look.',
    },
    body: {
      ru: 'Этот текст создан для показа раздела новостей и будет заменён материалами архива.',
      kk: 'Бұл мәтін жаңалықтар бөлімін көрсету үшін жасалған және мұрағат материалдарымен ауыстырылады.',
      en: 'This text exists to demonstrate the news section and will be replaced with archive content.',
    },
  },
  {
    slug: 'demo-catalog-search',
    daysAgo: 3,
    title: { ru: 'Поиск по каталогу по шифру и словам', kk: 'Каталогтан шифр және сөз бойынша іздеу', en: 'Catalogue search by code and keywords' },
    lead: {
      ru: 'Демонстрационная новость о возможностях поиска.',
      kk: 'Іздеу мүмкіндіктері туралы демонстрациялық жаңалық.',
      en: 'A demo item about search features.',
    },
    body: {
      ru: 'В строку поиска можно ввести шифр, например «Ф. 12. Оп. 3», или слова из названия документа.',
      kk: 'Іздеу жолына шифрды немесе құжат атауындағы сөздерді енгізуге болады.',
      en: 'You can type a reference code or words from a document title into the search box.',
    },
  },
];

export async function seedDemo(db: PrismaClient): Promise<void> {
  const topics = new Map((await db.category.findMany({ where: { kind: 'history_topic' } })).map((c) => [c.slug, c.id]));
  const newsRubric = await db.category.findUnique({ where: { kind_slug: { kind: 'news_rubric', slug: 'news' } } });

  for (const p of PUBLICATIONS) {
    const data = {
      kind: 'article' as const,
      sourceNote: DEMO_SOURCE,
      authorship: 'Команда разработки (демо)',
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

  const exhibition = await db.exhibition.upsert({
    where: { slug: 'demo-exhibition-example' },
    update: {},
    create: { slug: 'demo-exhibition-example', publicationStatus: 'published', dataOrigin: 'demo' },
  });
  await db.exhibitionTranslation.deleteMany({ where: { exhibitionId: exhibition.id } });
  await db.exhibitionTranslation.createMany({
    data: LOCALES.map((locale) => ({
      exhibitionId: exhibition.id,
      locale,
      title: title({ ru: 'Пример виртуальной выставки', kk: 'Виртуалды көрме үлгісі', en: 'Sample virtual exhibition' }, locale),
      lead: { ru: 'Показывает, как устроена страница выставки.', kk: 'Көрме бетінің құрылымын көрсетеді.', en: 'Shows how an exhibition page is laid out.' }[locale],
      translationStatus: statusFor(locale),
    })),
  });
}
