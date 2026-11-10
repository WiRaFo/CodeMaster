import type { FastifyInstance } from 'fastify';
import { type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { feedbackInputSchema, langOnlySchema, type Locale } from '@archive-vko/shared';
import { ApiError } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { assertSameOrigin } from '../../http/staff.ts';
import { LoginLimiter } from '../auth/login-limiter.ts';
import { publicStaff } from './staff.ts';

const historyBlocksSchema = z.array(z.discriminatedUnion('type', [
  z.object({ type: z.literal('p'), text: z.string() }),
  z.object({ type: z.enum(['ol', 'ul']), items: z.array(z.string()) }),
]));

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
export async function siteRoutes(app: FastifyInstance, opts: { db: PrismaClient; allowedOrigins: readonly string[] }): Promise<void> {
  const { db, allowedOrigins } = opts;
  const limiter = new LoginLimiter(5, 5, 10 * 60_000);

  app.get('/faq', async (request, reply) => {
    const lang: Locale = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const items = await db.faqItem.findMany({
      where: { publicationStatus: 'published' },
      orderBy: { sortOrder: 'asc' },
      include: { translations: true },
    });
    return {
      items: items.flatMap((f) => {
        const t = f.translations.find((x) => x.locale === lang) ?? f.translations.find((x) => x.locale === 'ru') ?? f.translations[0];
        return t ? [{ id: f.id, question: t.question, answer: t.answer, dataOrigin: f.dataOrigin, contentLang: t.locale, translationStatus: t.translationStatus }] : [];
      }),
    };
  });

  /**
   * «Об архиве» (ТЗ §5.2, с. 5): история, структура и ссылки на соцсети из сведений, переданных архивом.
   * Нет перевода — отдаётся русский текст, contentLang сообщает язык.
   */
  app.get('/about', async (request, reply) => {
    const lang: Locale = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [page, main, social] = await Promise.all([
      db.page.findFirst({
        where: { key: 'about/history', publicationStatus: 'published', deletedAt: null },
        include: { translations: { where: { translationStatus: { not: 'missing' } } } },
      }),
      db.branch.findFirst({ where: { isMain: true, publicationStatus: 'published', deletedAt: null }, select: { id: true } }),
      db.siteSetting.findUnique({ where: { key: 'social_links' } }),
    ]);
    const t = page && (page.translations.find((x) => x.locale === lang) ?? page.translations.find((x) => x.locale === 'ru') ?? page.translations[0]);
    const links = socialLinksSchema.safeParse(social?.value);
    return {
      history: page && t ? {
        title: t.title,
        blocks: historyBlocksSchema.parse(t.body),
        contentLang: t.locale,
        translationStatus: t.translationStatus,
        dataOrigin: page.dataOrigin,
      } : null,
      staff: main ? await publicStaff(db, main.id, lang) : [],
      social: links.success ? links.data : [],
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
