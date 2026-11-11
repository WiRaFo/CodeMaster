import type { FastifyInstance } from 'fastify';
import { type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ABOUT_SECTIONS, FAQ_TOPICS, feedbackInputSchema, langOnlySchema, type Locale } from '@archive-vko/shared';
import { ApiError, notFound } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { sendPublicImage } from '../../http/public-image.ts';
import { assertSameOrigin } from '../../http/staff.ts';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import { LoginLimiter } from '../auth/login-limiter.ts';
import { SITE_FILE } from '../admin/page-markup.ts';
import { publicStaff } from './staff.ts';

const historyBlocksSchema = z.array(z.discriminatedUnion('type', [
  z.object({ type: z.enum(['p', 'h']), text: z.string() }),
  z.object({ type: z.enum(['ol', 'ul']), items: z.array(z.string()) }),
]));

export const infoBodySchema = z.object({
  actualizedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  blocks: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.enum(['p', 'h', 'pending']), text: z.string() }),
    z.object({ type: z.enum(['ol', 'ul']), items: z.array(z.string()) }),
    z.object({ type: z.literal('links'), items: z.array(z.object({ label: z.string(), url: z.union([z.string().url().startsWith('https://'), z.string().regex(SITE_FILE)]), note: z.string().optional() })) }),
    z.object({ type: z.literal('table'), head: z.array(z.string()).min(2).max(6), rows: z.array(z.array(z.string())) }),
  ])),
});

/**
 * Текст раздела «Об архиве»: прежний формат (массив блоков из миграции) или формат справочных страниц,
 * который сохраняет панель. Блок «ожидаются сведения» и ссылки — только во втором.
 */
export const aboutBodySchema = z.union([
  historyBlocksSchema.transform((blocks) => ({ actualizedAt: null, blocks })),
  infoBodySchema.transform((b) => ({ actualizedAt: b.actualizedAt as string | null, blocks: b.blocks })),
]);

/** Справочные страницы, которые отдаёт GET /pages/:key. Остальные страницы имеют свои маршруты. */
export const INFO_PAGE_KEYS = ['services', 'services/paid', 'legislation', 'reading-room', 'symbols', 'links'] as const;
const infoPageParamsSchema = z.object({ key: z.enum(INFO_PAGE_KEYS) });

const calendarQuerySchema = langOnlySchema.extend({
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const tri = z.object({ ru: z.string(), kk: z.string(), en: z.string() });
const anticorruptionSchema = z.object({
  officer: z.object({ fullName: z.string(), position: tri }),
  documents: z.array(z.object({
    key: z.string(),
    title: tri,
    scanned: z.boolean(),
    files: z.array(z.object({ locale: z.enum(['ru', 'kk', 'en']), url: z.string().startsWith('/files/'), sizeBytes: z.number().int(), pages: z.number().int() })),
  })),
});

const socialLinksSchema = z.array(z.object({
  network: z.enum(['instagram', 'facebook']),
  label: z.string(),
  url: z.string().url().startsWith('https://'),
}));

/**
 * Вопросы и ответы (ТЗ §4; F-001) и форма отзывов и предложений (разрешена организаторами).
 * Отзыв — не обращение и не заявление: ответ на него не обещается, личные данные — только
 * необязательный адрес почты с согласием. IP-адрес не сохраняется.
 */
export async function siteRoutes(app: FastifyInstance, opts: { db: PrismaClient; storage: ObjectStorage; allowedOrigins: readonly string[] }): Promise<void> {
  const { db, storage, allowedOrigins } = opts;
  const limiter = new LoginLimiter(5, 5, 10 * 60_000);

  app.get('/faq', async (request, reply) => {
    const lang: Locale = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const rows = await db.faqItem.findMany({
      where: { publicationStatus: 'published' },
      orderBy: { sortOrder: 'asc' },
      include: { translations: true },
    });
    // Группы по темам в порядке FAQ_TOPICS (дополнение к ТЗ §2), внутри темы — по sortOrder.
    const rank = (t: string) => FAQ_TOPICS.findIndex((x) => x === t);
    const items = rows.sort((a, b) => rank(a.topic) - rank(b.topic) || a.sortOrder - b.sortOrder);
    return {
      items: items.flatMap((f) => {
        const t = f.translations.find((x) => x.locale === lang) ?? f.translations.find((x) => x.locale === 'ru') ?? f.translations[0];
        return t ? [{ id: f.id, topic: f.topic, question: t.question, answer: t.answer, dataOrigin: f.dataOrigin, contentLang: t.locale, translationStatus: t.translationStatus }] : [];
      }),
    };
  });

  /**
   * «Об архиве» (ТЗ §5.2, с. 5; F-023, F-021): история и другие разделы из панели, структура, ссылки на соцсети,
   * фотогалерея учреждения. Нет перевода — отдаётся русский текст, contentLang сообщает язык.
   * Фото — только из public_about_gallery_v (проверенные антивирусом, с описанием для незрячих).
   */
  app.get('/about', async (request, reply) => {
    const lang: Locale = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const keys = ABOUT_SECTIONS.map((s) => s.key);
    const [pages, main, social, gallery] = await Promise.all([
      db.page.findMany({
        where: { key: { in: keys }, publicationStatus: 'published', deletedAt: null },
        include: { translations: { where: { translationStatus: { not: 'missing' } } } },
      }),
      db.branch.findFirst({ where: { isMain: true, publicationStatus: 'published', deletedAt: null }, select: { id: true } }),
      db.siteSetting.findUnique({ where: { key: 'social_links' } }),
      db.$queryRaw<Array<{ position: bigint; width: number | null; height: number | null; alt_text: string | null; caption: string | null; content_lang: string | null; data_origin: string }>>`
        SELECT g.position, g.width, g.height, t.alt_text, t.caption, t.locale::text AS content_lang, a.data_origin::text AS data_origin
        FROM public_about_gallery_v g
        JOIN digital_assets a ON a.id = g.asset_id
        LEFT JOIN LATERAL (
          SELECT alt_text, caption, locale FROM asset_translations
          WHERE asset_id = g.asset_id AND coalesce(trim(alt_text), '') <> ''
          ORDER BY (locale = ${lang}::"Locale") DESC, (locale = 'ru') DESC LIMIT 1
        ) t ON true
        ORDER BY g.position`,
    ]);
    const sections = keys.flatMap((key) => {
      const page = pages.find((p) => p.key === key);
      const t = page && (page.translations.find((x) => x.locale === lang) ?? page.translations.find((x) => x.locale === 'ru') ?? page.translations[0]);
      const body = t ? aboutBodySchema.safeParse(t.body) : null;
      if (!page || !t || !body?.success) return [];
      return [{
        key: page.key,
        title: t.title,
        lead: t.lead,
        blocks: body.data.blocks,
        actualizedAt: body.data.actualizedAt,
        contentLang: t.locale,
        translationStatus: t.translationStatus,
        dataOrigin: page.dataOrigin,
      }];
    });
    const links = socialLinksSchema.safeParse(social?.value);
    const history = sections.find((s) => s.key === 'about/history');
    return {
      history: history ?? null,
      sections: sections.filter((s) => s.key !== 'about/history'),
      staff: main ? await publicStaff(db, main.id, lang) : [],
      social: links.success ? links.data : [],
      gallery: gallery.map((g) => ({
        url: `/api/v1/about/gallery/${Number(g.position)}`,
        width: g.width,
        height: g.height,
        alt: g.alt_text ?? '',
        caption: g.caption,
        contentLang: g.content_lang,
        dataOrigin: g.data_origin,
      })),
    };
  });

  app.get('/about/gallery/:number', async (request, reply) => {
    const parsed = z.object({ number: z.string().regex(/^[1-9]\d{0,2}$/) }).safeParse(request.params);
    if (!parsed.success) throw notFound();
    const [file] = await db.$queryRaw<Array<{ storage_bucket: string; storage_key: string; mime_type: string; asset_id: string }>>`
      SELECT storage_bucket, storage_key, mime_type, asset_id FROM public_about_gallery_v WHERE position = ${Number(parsed.data.number)}`;
    return sendPublicImage(storage, request, reply, file);
  });

  /**
   * Календарь юбилейных и памятных дат области (сведения архива). Без года — текущий год, если он есть,
   * иначе последний. month — только записи этого месяца (для блока на главной); без даты в году — month IS NULL.
   */
  app.get('/calendar', async (request, reply) => {
    const query = calendarQuerySchema.parse(request.query);
    const lang: Locale = resolveLang(request, reply, query.lang);
    const published = { publicationStatus: 'published' as const, deletedAt: null };
    const years = (await db.memorableDate.groupBy({ by: ['calendarYear'], where: published, orderBy: { calendarYear: 'desc' } }))
      .map((y) => y.calendarYear);
    const current = new Date().getFullYear();
    const year = query.year ?? (years.includes(current) ? current : years[0]);
    if (year === undefined || !years.includes(year)) return { years, year: year ?? null, items: [] };
    const rows = await db.memorableDate.findMany({
      where: { ...published, calendarYear: year, ...(query.month ? { month: query.month } : {}) },
      orderBy: { sortOrder: 'asc' },
      include: { translations: { where: { translationStatus: { not: 'missing' } } } },
    });
    return {
      years,
      year,
      items: rows.flatMap((r) => {
        const t = r.translations.find((x) => x.locale === lang) ?? r.translations.find((x) => x.locale === 'ru') ?? r.translations[0];
        return t ? [{ id: r.id, month: r.month, day: r.day, dateLabel: t.dateLabel, text: t.text, contentLang: t.locale, translationStatus: t.translationStatus }] : [];
      }),
    };
  });

  /** «Противодействие коррупции» (сведения архива): текст, комплаенс-офицер, документы на русском и казахском. */
  app.get('/anticorruption', async (request, reply) => {
    const lang: Locale = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [page, setting] = await Promise.all([
      db.page.findFirst({
        where: { key: 'anticorruption', publicationStatus: 'published', deletedAt: null },
        include: { translations: { where: { translationStatus: { not: 'missing' } } } },
      }),
      db.siteSetting.findUnique({ where: { key: 'anticorruption' } }),
    ]);
    const t = page && (page.translations.find((x) => x.locale === lang) ?? page.translations.find((x) => x.locale === 'ru') ?? page.translations[0]);
    const info = anticorruptionSchema.safeParse(setting?.value);
    return {
      text: t ? { title: t.title, blocks: historyBlocksSchema.parse(t.body), contentLang: t.locale, translationStatus: t.translationStatus } : null,
      officer: info.success ? { fullName: info.data.officer.fullName, position: info.data.officer.position[lang] } : null,
      documents: info.success
        ? info.data.documents.map((d) => ({ key: d.key, title: d.title[lang], scanned: d.scanned, files: d.files }))
        : [],
    };
  });

  /**
   * Справочные разделы по дополнению к ТЗ: государственная и платные услуги, законодательство, читальный зал,
   * государственные символы, полезные ссылки. Только сведения и внешние ссылки — заявления сайт не принимает.
   * Ключ вне списка и неопубликованная страница — одинаковый 404.
   */
  app.get('/pages/*', async (request, reply) => {
    const lang: Locale = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const params = infoPageParamsSchema.safeParse({ key: (request.params as { '*': string })['*'] });
    if (!params.success) throw notFound();
    const page = await db.page.findFirst({
      where: { key: params.data.key, publicationStatus: 'published', deletedAt: null },
      include: { translations: { where: { translationStatus: { not: 'missing' } } } },
    });
    const t = page && (page.translations.find((x) => x.locale === lang) ?? page.translations.find((x) => x.locale === 'ru') ?? page.translations[0]);
    if (!page || !t) throw notFound();
    const body = infoBodySchema.parse(t.body);
    return {
      key: page.key,
      title: t.title,
      lead: t.lead,
      blocks: body.blocks,
      actualizedAt: body.actualizedAt,
      contentLang: t.locale,
      translationStatus: t.translationStatus,
      dataOrigin: page.dataOrigin,
    };
  });

  app.post('/feedback', async (request, reply) => {
    assertSameOrigin(request, allowedOrigins);
    const input = feedbackInputSchema.parse(request.body);
    if (!limiter.take(request.ip, 'feedback')) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many messages, try again later');
    // Бот заполнил скрытое поле: отвечаем как обычно, но ничего не сохраняем.
    if (!input.website) {
      await db.feedbackMessage.create({
        data: { topic: input.topic, message: input.message, contactEmail: input.contactEmail, locale: input.lang, pagePath: input.pagePath ?? null },
      });
    }
    reply.header('Cache-Control', 'no-store');
    return reply.code(202).send({ accepted: true });
  });
}
