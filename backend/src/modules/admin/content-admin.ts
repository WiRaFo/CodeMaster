import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FAQ_TOPICS, LOCALES, faqInputSchema, type Locale } from '@archive-vko/shared';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { requirePermission } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';
import { INFO_PAGE_KEYS } from '../content/site.routes.ts';
import { parseMarkup, toMarkup, type InfoBlock } from './page-markup.ts';

/**
 * Справочные страницы и вопросы-ответы в панели (F-052; дополнение к ТЗ §2 и §3.5).
 * Читать — pages:edit, сохранять — pages:publish: правка сразу видна на сайте, поэтому её делает тот,
 * кто вправе публиковать. Каждое сохранение пишется в журнал с изменёнными языками и полями.
 */

const pageKeySchema = z.object({ key: z.enum(INFO_PAGE_KEYS) });
const pageInputSchema = z.object({
  actualizedAt: z.iso.date(),
  translations: z.partialRecord(z.enum(LOCALES), z.object({
    title: z.string().trim().min(2).max(200),
    lead: z.string().trim().max(1000).transform((v) => (v === '' ? null : v)).nullable(),
    markup: z.string().max(30_000),
  })),
}).refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru', 'title'], message: 'required' });

const bodySchema = z.object({ actualizedAt: z.string(), blocks: z.array(z.custom<InfoBlock>()) });

export async function contentAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  // Ключ страницы содержит «/» (services/paid), поэтому маршрут с подстановочным хвостом.
  const pageKey = (params: unknown) => {
    const parsed = pageKeySchema.safeParse({ key: (params as { '*': string })['*'] });
    if (!parsed.success) throw notFound();
    return parsed.data.key;
  };

  app.get('/admin/pages', async (request) => {
    requirePermission(request, 'pages:edit');
    const pages = await db.page.findMany({
      where: { key: { in: [...INFO_PAGE_KEYS] }, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { key: true, updatedAt: true, translations: { select: { locale: true, title: true, translationStatus: true, body: true } } },
    });
    return {
      items: pages.map((p) => {
        const ru = p.translations.find((t) => t.locale === 'ru');
        const body = bodySchema.safeParse(ru?.body);
        return {
          key: p.key,
          title: ru?.title ?? p.key,
          actualizedAt: body.success ? body.data.actualizedAt : null,
          pending: body.success ? body.data.blocks.filter((b) => b.type === 'pending').length : 0,
          languages: p.translations.map((t) => ({ locale: t.locale, status: t.translationStatus })),
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
    };
  });

  app.get('/admin/pages/*', async (request) => {
    requirePermission(request, 'pages:edit');
    const key = pageKey(request.params);
    const page = await db.page.findFirst({ where: { key, deletedAt: null }, include: { translations: true } });
    if (!page) throw notFound();
    const ru = bodySchema.safeParse(page.translations.find((t) => t.locale === 'ru')?.body);
    return {
      key,
      updatedAt: page.updatedAt.toISOString(),
      actualizedAt: ru.success ? ru.data.actualizedAt : null,
      translations: Object.fromEntries(page.translations.map((t) => {
        const body = bodySchema.safeParse(t.body);
        return [t.locale, { title: t.title, lead: t.lead, markup: body.success ? toMarkup(body.data.blocks) : '', translationStatus: t.translationStatus }];
      })),
    };
  });

  app.put('/admin/pages/*', async (request) => {
    const staff = requirePermission(request, 'pages:publish');
    const key = pageKey(request.params);
    const page = await db.page.findFirst({ where: { key, deletedAt: null }, include: { translations: true } });
    if (!page) throw notFound();
    assertIfMatch(request, page.updatedAt);
    const input = pageInputSchema.parse(request.body);
    const parsed = Object.entries(input.translations).map(([locale, t]) => ({ locale: locale as Locale, t, ...parseMarkup(t.markup) }));
    const issues = parsed.flatMap((p) => p.issues.map((i) => ({ path: ['translations', p.locale, 'markup', String(i.line)], code: 'markup', message: i.message })));
    if (issues.length) throw new ApiError(400, 'VALIDATION_FAILED', issues.map((i) => i.message).join('; '), issues.map(({ path, code }) => ({ path, code })));
    const changed: string[] = [];
    const updated = await db.$transaction(async (tx) => {
      for (const p of parsed) {
        const prev = page.translations.find((x) => x.locale === p.locale);
        const body = { actualizedAt: input.actualizedAt, blocks: p.blocks };
        if (!prev || prev.title !== p.t.title || prev.lead !== p.t.lead || JSON.stringify(prev.body) !== JSON.stringify(body)) changed.push(p.locale);
        const bodyText = p.blocks.map((b) => ('items' in b ? b.items.map((i) => (typeof i === 'string' ? i : i.label)).join('\n') : b.text)).join('\n\n');
        const data = { title: p.t.title, lead: p.t.lead, body, bodyText, translationStatus: 'reviewed' as const };
        await tx.pageTranslation.upsert({ where: { pageId_locale: { pageId: page.id, locale: p.locale } }, update: data, create: { ...data, pageId: page.id, locale: p.locale } });
      }
      const row = await tx.page.update({ where: { id: page.id }, data: { updatedById: staff.session.userId, dataOrigin: 'verified' } });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'update', entityType: 'page', entityId: page.id,
        summary: `Страница «${input.translations.ru?.title ?? key}»: ${changed.length ? `изменены языки ${changed.join(', ')}` : 'без изменений'}`,
        changes: { languages: changed, actualizedAt: input.actualizedAt },
      });
      return row;
    });
    return { key, updatedAt: updated.updatedAt.toISOString(), changed };
  });

  // ---------- Вопросы и ответы ----------

  const faqOut = (f: { id: string; topic: string; sortOrder: number; publicationStatus: string; dataOrigin: string; updatedAt: Date; translations: Array<{ locale: Locale; question: string; answer: string; translationStatus: string }> }) => ({
    id: f.id, topic: f.topic, sortOrder: f.sortOrder, published: f.publicationStatus === 'published', dataOrigin: f.dataOrigin, updatedAt: f.updatedAt.toISOString(),
    translations: Object.fromEntries(f.translations.map((t) => [t.locale, { question: t.question, answer: t.answer, translationStatus: t.translationStatus }])),
  });

  app.get('/admin/faq', async (request) => {
    requirePermission(request, 'pages:edit');
    const items = await db.faqItem.findMany({ orderBy: [{ sortOrder: 'asc' }], include: { translations: true } });
    const rank = (t: string) => FAQ_TOPICS.indexOf(t as (typeof FAQ_TOPICS)[number]);
    return { topics: FAQ_TOPICS, items: items.sort((a, b) => rank(a.topic) - rank(b.topic) || a.sortOrder - b.sortOrder).map(faqOut) };
  });

  const saveFaq = async (id: string | null, body: unknown, userId: string, request: Parameters<typeof writeAudit>[1]) => {
    const input = faqInputSchema.parse(body);
    return db.$transaction(async (tx) => {
      const data = { topic: input.topic, sortOrder: input.sortOrder, publicationStatus: input.published ? 'published' as const : 'draft' as const, dataOrigin: input.dataOrigin };
      const row = id ? await tx.faqItem.update({ where: { id }, data }) : await tx.faqItem.create({ data });
      for (const locale of LOCALES) {
        const t = input.translations[locale];
        if (!t) {
          await tx.faqItemTranslation.deleteMany({ where: { faqItemId: row.id, locale } });
          continue;
        }
        const tr = { question: t.question, answer: t.answer, translationStatus: 'reviewed' as const };
        await tx.faqItemTranslation.upsert({ where: { faqItemId_locale: { faqItemId: row.id, locale } }, update: tr, create: { ...tr, faqItemId: row.id, locale } });
      }
      await writeAudit(tx, request, {
        userId, action: id ? 'update' : 'create', entityType: 'faq', entityId: row.id,
        summary: `${id ? 'Изменён' : 'Добавлен'} вопрос «${input.translations.ru?.question ?? ''}» (${input.published ? 'опубликован' : 'черновик'})`,
        changes: { topic: input.topic, published: input.published, languages: Object.keys(input.translations) },
      });
      return tx.faqItem.findUniqueOrThrow({ where: { id: row.id }, include: { translations: true } });
    });
  };

  app.post('/admin/faq', async (request, reply) => {
    const staff = requirePermission(request, 'pages:publish');
    return reply.status(201).send(faqOut(await saveFaq(null, request.body, staff.session.userId, request)));
  });

  app.put('/admin/faq/:id', async (request) => {
    const staff = requirePermission(request, 'pages:publish');
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const current = await db.faqItem.findUnique({ where: { id }, select: { updatedAt: true } });
    if (!current) throw notFound();
    assertIfMatch(request, current.updatedAt);
    return faqOut(await saveFaq(id, request.body, staff.session.userId, request));
  });

  app.delete('/admin/faq/:id', async (request, reply) => {
    const staff = requirePermission(request, 'pages:publish');
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const body = z.object({ confirm: z.boolean().optional() }).parse(request.body ?? {});
    if (!body.confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    const item = await db.faqItem.findUnique({ where: { id }, include: { translations: { where: { locale: 'ru' } } } });
    if (!item) throw notFound();
    await db.$transaction(async (tx) => {
      await tx.faqItem.delete({ where: { id } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'faq', entityId: id, summary: `Удалён вопрос «${item.translations[0]?.question ?? id}»` });
    });
    return reply.status(204).send();
  });
}
