import type { FastifyInstance } from 'fastify';
import { type PrismaClient } from '@prisma/client';
import { feedbackInputSchema, langOnlySchema, type Locale } from '@archive-vko/shared';
import { ApiError } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { assertSameOrigin } from '../../http/staff.ts';
import { LoginLimiter } from '../auth/login-limiter.ts';

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
