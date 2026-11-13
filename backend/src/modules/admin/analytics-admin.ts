import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LOCALES, knowledgeInputSchema } from '@archive-vko/shared';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { requirePermission } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';

const daysSchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
const since = (days: number) => new Date(Date.now() - days * 86_400_000);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Аналитика сайта (ТЗ §5.8 Д, с. 11; F-126, F-127) и база знаний помощника (ТЗ §5.8 А) в панели.
 * Аналитика — только обезличенные счётчики; запросы показываются уже замаскированными.
 */
export async function analyticsAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  app.get('/admin/analytics', async (request) => {
    requirePermission(request, 'stats:read');
    const { days } = daysSchema.parse(request.query);
    const from = since(days);
    const day = { gte: new Date(dayKey(from)) };
    const [views, errors, queries, zero] = await Promise.all([
      db.analyticsPageView.findMany({ where: { day } }),
      db.analyticsError.groupBy({ by: ['kind', 'path'], where: { day }, _sum: { count: true }, orderBy: { _sum: { count: 'desc' } }, take: 20 }),
      db.searchQuery.groupBy({ by: ['queryText', 'source'], where: { occurredAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { queryText: 'desc' } }, take: 20 }),
      db.searchQuery.groupBy({ by: ['queryText', 'source'], where: { occurredAt: { gte: from }, resultCount: 0 }, _count: { _all: true }, orderBy: { _count: { queryText: 'desc' } }, take: 20 }),
    ]);
    const sum = <K extends string>(rows: Array<Record<K, string> & { views: number }>, key: K) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + r.views);
      return [...m].map(([k, v]) => ({ key: k, views: v })).sort((a, b) => b.views - a.views);
    };
    const flat = views.map((v) => ({ section: v.section, locale: v.locale, day: dayKey(v.day), views: v.views }));
    const totalQueries = await db.searchQuery.count({ where: { occurredAt: { gte: from } } });
    const zeroQueries = await db.searchQuery.count({ where: { occurredAt: { gte: from }, resultCount: 0 } });
    return {
      days,
      totalViews: flat.reduce((n, v) => n + v.views, 0),
      bySection: sum(flat, 'section'),
      byLocale: sum(flat, 'locale'),
      byDay: sum(flat, 'day').sort((a, b) => a.key.localeCompare(b.key)),
      queries: { total: totalQueries, zero: zeroQueries },
      topQueries: queries.map((q) => ({ text: q.queryText, source: q.source, count: q._count._all })),
      zeroQueries: zero.map((q) => ({ text: q.queryText, source: q.source, count: q._count._all })),
      errors: errors.map((e) => ({ kind: e.kind, path: e.path, count: e._sum.count ?? 0 })),
    };
  });

  // ---------- База знаний помощника ----------

  type Row = Awaited<ReturnType<typeof load>>[number];
  const load = (where: { id?: string } = {}) => db.assistantKnowledge.findMany({ where, orderBy: { updatedAt: 'desc' }, include: { translations: true } });
  const out = (k: Row) => ({
    id: k.id, published: k.publicationStatus === 'published', links: k.links, updatedAt: k.updatedAt.toISOString(),
    translations: Object.fromEntries(k.translations.map((t) => [t.locale, { question: t.question, keywords: t.keywords, answer: t.answer }])),
  });

  app.get('/admin/assistant/knowledge', async (request) => {
    requirePermission(request, 'pages:edit');
    return { items: (await load()).map(out) };
  });

  /** Вопросы, на которые помощник не нашёл ответа: из них сотрудник делает записи базы знаний. */
  app.get('/admin/assistant/unanswered', async (request) => {
    requirePermission(request, 'pages:edit');
    const { days } = daysSchema.parse(request.query);
    const rows = await db.searchQuery.groupBy({
      by: ['queryText', 'locale'], where: { source: 'assistant', resultCount: 0, occurredAt: { gte: since(days) } },
      _count: { _all: true }, _max: { occurredAt: true }, orderBy: { _max: { occurredAt: 'desc' } }, take: 50,
    });
    return { items: rows.map((r) => ({ text: r.queryText, locale: r.locale, count: r._count._all, lastAt: r._max.occurredAt?.toISOString() ?? null })) };
  });

  const save = async (id: string | null, body: unknown, userId: string, request: Parameters<typeof writeAudit>[1]) => {
    const input = knowledgeInputSchema.parse(body);
    const id2 = await db.$transaction(async (tx) => {
      const data = { links: input.links, publicationStatus: input.published ? 'published' as const : 'draft' as const, updatedById: userId };
      const row = id ? await tx.assistantKnowledge.update({ where: { id }, data }) : await tx.assistantKnowledge.create({ data: { ...data, createdById: userId } });
      for (const locale of LOCALES) {
        const t = input.translations[locale];
        if (!t) {
          await tx.assistantKnowledgeTranslation.deleteMany({ where: { entryId: row.id, locale } });
          continue;
        }
        await tx.assistantKnowledgeTranslation.upsert({ where: { entryId_locale: { entryId: row.id, locale } }, update: t, create: { ...t, entryId: row.id, locale } });
      }
      await writeAudit(tx, request, {
        userId, action: id ? 'update' : 'create', entityType: 'assistant_knowledge', entityId: row.id,
        summary: `${id ? 'Изменён' : 'Добавлен'} ответ помощника «${input.translations.ru?.question ?? ''}» (${input.published ? 'опубликован' : 'черновик'})`,
        changes: { published: input.published, links: input.links, languages: Object.keys(input.translations) },
      });
      return row.id;
    });
    return out((await load({ id: id2 }))[0]!);
  };

  app.post('/admin/assistant/knowledge', async (request, reply) => {
    const staff = requirePermission(request, 'pages:publish');
    return reply.status(201).send(await save(null, request.body, staff.session.userId, request));
  });

  app.put('/admin/assistant/knowledge/:id', async (request) => {
    const staff = requirePermission(request, 'pages:publish');
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const current = await db.assistantKnowledge.findUnique({ where: { id }, select: { updatedAt: true } });
    if (!current) throw notFound();
    assertIfMatch(request, current.updatedAt);
    return save(id, request.body, staff.session.userId, request);
  });

  app.delete('/admin/assistant/knowledge/:id', async (request, reply) => {
    const staff = requirePermission(request, 'pages:publish');
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const body = z.object({ confirm: z.boolean().optional() }).parse(request.body ?? {});
    if (!body.confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    const item = await db.assistantKnowledge.findUnique({ where: { id }, include: { translations: { where: { locale: 'ru' } } } });
    if (!item) throw notFound();
    await db.$transaction(async (tx) => {
      await tx.assistantKnowledge.delete({ where: { id } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'assistant_knowledge', entityId: id, summary: `Удалён ответ помощника «${item.translations[0]?.question ?? id}»` });
    });
    return reply.status(204).send();
  });
}
