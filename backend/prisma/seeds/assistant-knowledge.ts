import type { PrismaClient } from '@prisma/client';
import { LOCALES, type AssistantSection, type Locale } from '@archive-vko/shared';

/**
 * Начальные записи базы знаний помощника (ТЗ §5.8 А). Только сведения, которые архив прислал сам
 * (часы работы — «Контакты.docx» от 10.11.2026; прейскурант — постановление акимата № 289 от 15.12.2023).
 * Дальше записи ведут сотрудники в панели; сид их не перезаписывает, если запись уже изменена.
 */
interface Entry {
  id: string;
  links: AssistantSection[];
  tr: Record<Locale, { question: string; keywords: string[]; answer: string }>;
}

const ENTRIES: Entry[] = [
  {
    id: '6b1c0f1e-2a51-4c55-9a0e-000000000001',
    links: ['visitors'],
    tr: {
      ru: {
        question: 'Когда работает архив?',
        keywords: ['часы работы', 'режим работы', 'график работы', 'когда работает', 'во сколько открыва'],
        answer: 'Архив работает с понедельника по пятницу с 8:00 до 17:00. Читальный зал открыт с понедельника по пятницу с 9:00 до 16:00. Перед посещением посмотрите раздел «Посетителям».',
      },
      kk: {
        question: 'Мұрағат қашан жұмыс істейді?',
        keywords: ['жұмыс уақыты', 'жұмыс кестесі', 'қашан жұмыс', 'жұмыс тәртібі'],
        answer: 'Мұрағат дүйсенбіден жұмаға дейін 8:00-ден 17:00-ге дейін жұмыс істейді. Оқу залы дүйсенбіден жұмаға дейін 9:00-ден 16:00-ге дейін ашық. Келер алдында «Келушілерге» бөлімін қараңыз.',
      },
      en: {
        question: 'When is the archive open?',
        keywords: ['opening hours', 'working hours', 'when is the archive open', 'when are you open'],
        answer: 'The archive is open Monday to Friday, 8:00–17:00. The reading room is open Monday to Friday, 9:00–16:00. Before your visit, see the For visitors section.',
      },
    },
  },
  {
    id: '6b1c0f1e-2a51-4c55-9a0e-000000000002',
    links: ['services'],
    tr: {
      ru: {
        question: 'Сколько стоят платные услуги архива?',
        keywords: ['платные услуги', 'прейскурант', 'сколько стоит', 'стоимость услуг', 'цены на услуги'],
        answer: 'Перечень платных услуг и цены утверждены постановлением акимата Восточно-Казахстанской области № 289 от 15.12.2023. Цены опубликованы на странице «Платные услуги». Сайт не оформляет заказы и не принимает оплату.',
      },
      kk: {
        question: 'Мұрағаттың ақылы қызметтері қанша тұрады?',
        keywords: ['ақылы қызмет', 'прейскурант', 'қанша тұрады', 'қызмет құны', 'қызмет бағасы'],
        answer: 'Ақылы қызметтердің тізбесі мен бағасы Шығыс Қазақстан облысы әкімдігінің 2023 жылғы 15 желтоқсандағы № 289 қаулысымен бекітілген. Бағалар «Ақылы қызметтер» бетінде жарияланған. Сайт тапсырыс ресімдемейді және төлем қабылдамайды.',
      },
      en: {
        question: 'How much do the archive’s paid services cost?',
        keywords: ['paid services', 'price list', 'how much does', 'service fees', 'prices'],
        answer: 'The list of paid services and their prices were approved by resolution No. 289 of the East Kazakhstan Region akimat of 15.12.2023. The prices are published on the Paid services page. This website does not take orders or accept payments.',
      },
    },
  },
  {
    id: '6b1c0f1e-2a51-4c55-9a0e-000000000003',
    links: ['catalog', 'branches', 'visitors'],
    tr: {
      ru: {
        question: 'Что можно сделать на этом сайте?',
        keywords: ['что умеет сайт', 'что есть на сайте', 'что можно на сайте', 'что можно сделать на сайте', 'для чего сайт', 'возможности сайта'],
        answer: 'На сайте можно искать документы в электронном каталоге, узнать адреса и часы работы архива и филиалов, прочитать новости и материалы по истории. Сайт информационный: заявления и заказы через него не принимаются.',
      },
      kk: {
        question: 'Бұл сайтта не істеуге болады?',
        keywords: ['сайтта не бар', 'сайтта не істеуге', 'сайт не үшін', 'сайттың мүмкіндіктері'],
        answer: 'Сайтта электрондық каталогтан құжаттарды іздеуге, мұрағат пен филиалдардың мекенжайлары мен жұмыс уақытын білуге, жаңалықтар мен тарих туралы материалдарды оқуға болады. Сайт ақпараттық: өтініштер мен тапсырыстар ол арқылы қабылданбайды.',
      },
      en: {
        question: 'What can I do on this website?',
        keywords: ['what can i do on', 'what is this site', 'what is this website', 'site features'],
        answer: 'On this website you can search documents in the e-catalogue, find addresses and opening hours of the archive and its branches, and read news and history materials. The website is informational: it does not accept applications or orders.',
      },
    },
  },
];

export async function seedAssistantKnowledge(db: PrismaClient): Promise<void> {
  for (const e of ENTRIES) {
    const existing = await db.assistantKnowledge.findUnique({ where: { id: e.id }, select: { updatedById: true } });
    if (existing?.updatedById) continue; // запись уже правил сотрудник
    await db.assistantKnowledge.upsert({
      where: { id: e.id },
      update: { links: e.links, publicationStatus: 'published' },
      create: { id: e.id, links: e.links, publicationStatus: 'published' },
    });
    for (const locale of LOCALES) {
      const t = e.tr[locale];
      await db.assistantKnowledgeTranslation.upsert({ where: { entryId_locale: { entryId: e.id, locale } }, update: t, create: { ...t, entryId: e.id, locale } });
    }
  }
}
