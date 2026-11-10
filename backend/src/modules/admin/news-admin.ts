import type { Prisma, PrismaClient, PublicationStatus } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LOCALES, NEWS_RUBRICS, newsInputSchema, type NewsInput } from '@archive-vko/shared';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { staffOf, type Staff } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';
import { hasGrant } from '../auth/session.ts';
import { ruFirst } from './admin-common.ts';

/**
 * Новости в панели (ТЗ §5.11, с. 12; F-100). Права — ресурс news:
 * news:edit — создавать и править черновики и снятые новости; news:publish — публиковать, снимать, удалять
 * и править опубликованное. Администратор филиала получает news:edit только для своего филиала:
 * он видит и правит лишь новости этого филиала, остальные для него не существуют (404).
 * Текст хранится абзацами без HTML; удаление мягкое и требует подтверждения.
 */

const ids = z.object({ id: z.uuid() });
const confirmSchema = z.object({ confirm: z.boolean().optional() });

const newsSelect = {
  id: true, slug: true, branchId: true, publicationStatus: true, publishedAt: true, dataOrigin: true, sourceUrl: true, updatedAt: true,
  category: { select: { slug: true } },
  branch: { select: { slug: true } },
  translations: { select: { locale: true, title: true, lead: true, bodyText: true, translationStatus: true } },
} as const;
type NewsRow = Prisma.NewsGetPayload<{ select: typeof newsSelect }>;

const out = (n: NewsRow) => ({
  id: n.id,
  slug: n.slug,
  rubric: n.category?.slug ?? null,
  branchSlug: n.branch?.slug ?? null,
  status: n.publicationStatus,
  publishedAt: n.publishedAt?.toISOString() ?? null,
  dataOrigin: n.dataOrigin,
  sourceUrl: n.sourceUrl,
  updatedAt: n.updatedAt.toISOString(),
  translations: Object.fromEntries(n.translations.map((t) => [t.locale, { title: t.title, lead: t.lead, bodyText: t.bodyText ?? '', translationStatus: t.translationStatus }])),
});

const titleOf = (n: NewsRow) => ruFirst(n.translations)?.title ?? n.slug;

/** Правка черновика и снятой новости — news:edit, опубликованной — news:publish (правка сразу видна на сайте). */
const editPermission = (status: PublicationStatus) => (status === 'published' ? 'news:publish' : 'news:edit');

export async function newsAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  /** Сотрудник без прав на новости ни в одном филиале получает 403 до любых проверок ввода. */
  const newsStaff = (request: FastifyRequest): Staff => {
    const staff = staffOf(request);
    const any = ['news:edit', 'news:publish'].some((p) => staff.grants.global.has(p) || (staff.grants.byBranch.get(p)?.size ?? 0) > 0);
    if (!any) throw new ApiError(403, 'FORBIDDEN', 'Permission news:edit required');
    return staff;
  };
  const canSee = (staff: Staff, branchId: string | null) => hasGrant(staff.grants, 'news:edit', branchId) || hasGrant(staff.grants, 'news:publish', branchId);

  /** Новость, видимая сотруднику; чужая для него неотличима от несуществующей. */
  async function load(staff: Staff, id: string): Promise<NewsRow> {
    const n = await db.news.findFirst({ where: { id, deletedAt: null }, select: newsSelect });
    if (!n || !canSee(staff, n.branchId)) throw notFound();
    return n;
  }

  function requireGrant(staff: Staff, permission: string, branchId: string | null) {
    if (!hasGrant(staff.grants, permission, branchId)) throw new ApiError(403, 'FORBIDDEN', `Permission ${permission} required`);
  }

  /** Рубрика и филиал из ввода → идентификаторы; неизвестные значения — 400 с путём поля. */
  async function resolveRefs(input: NewsInput) {
    const category = await db.category.findUnique({ where: { kind_slug: { kind: 'news_rubric', slug: input.rubric } }, select: { id: true } });
    if (!category) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown rubric', [{ path: ['rubric'], code: 'unknown' }]);
    let branchId: string | null = null;
    if (input.branchSlug) {
      const b = await db.branch.findFirst({ where: { slug: input.branchSlug, deletedAt: null }, select: { id: true } });
      if (!b) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown branch', [{ path: ['branchSlug'], code: 'unknown' }]);
      branchId = b.id;
    }
    return { categoryId: category.id, branchId };
  }

  async function slugTaken(slug: string, exceptId: string | null) {
    const other = await db.news.findUnique({ where: { slug }, select: { id: true } });
    return other !== null && other.id !== exceptId;
  }

  async function writeTranslations(tx: Prisma.TransactionClient, newsId: string, input: NewsInput) {
    for (const locale of LOCALES) {
      const t = input.translations[locale];
      if (!t) {
        await tx.newsTranslation.deleteMany({ where: { newsId, locale } });
        continue;
      }
      const data = { title: t.title, lead: t.lead, bodyText: t.bodyText, body: { paragraphs: t.bodyText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean) }, translationStatus: 'reviewed' as const };
      await tx.newsTranslation.upsert({ where: { newsId_locale: { newsId, locale } }, update: data, create: { ...data, newsId, locale } });
    }
  }

  app.get('/admin/news', async (request) => {
    const staff = newsStaff(request);
    const global = staff.grants.global.has('news:edit') || staff.grants.global.has('news:publish');
    const ownBranches = [...(staff.grants.byBranch.get('news:edit') ?? [])];
    const [items, branches] = await Promise.all([
      db.news.findMany({
        where: { deletedAt: null, ...(global ? {} : { branchId: { in: ownBranches } }) },
        orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        select: newsSelect,
      }),
      db.branch.findMany({
        where: { deletedAt: null, ...(global ? {} : { id: { in: ownBranches } }) },
        orderBy: { sortOrder: 'asc' },
        select: { slug: true, translations: { where: { locale: 'ru' }, select: { shortName: true, fullName: true } } },
      }),
    ]);
    return {
      items: items.map((n) => ({ ...out(n), title: titleOf(n) })),
      rubrics: NEWS_RUBRICS,
      branches: branches.map((b) => ({ slug: b.slug, name: b.translations[0]?.shortName ?? b.translations[0]?.fullName ?? b.slug })),
      // Без глобального права новость обязана быть привязана к своему филиалу.
      branchRequired: !global,
      canPublish: staff.grants.global.has('news:publish'),
    };
  });

  app.get('/admin/news/:id', async (request) => {
    const { id } = ids.parse(request.params);
    return out(await load(newsStaff(request), id));
  });

  app.post('/admin/news', async (request, reply) => {
    const staff = newsStaff(request);
    const input = newsInputSchema.parse(request.body);
    const refs = await resolveRefs(input);
    requireGrant(staff, 'news:edit', refs.branchId);
    if (await slugTaken(input.slug, null)) throw new ApiError(409, 'CONFLICT', 'Slug is already used');
    const row = await db.$transaction(async (tx) => {
      const n = await tx.news.create({
        data: { slug: input.slug, ...refs, dataOrigin: input.dataOrigin, sourceUrl: input.sourceUrl, createdById: staff.session.userId, updatedById: staff.session.userId },
      });
      await writeTranslations(tx, n.id, input);
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'create', entityType: 'news', entityId: n.id,
        summary: `Создана новость «${input.translations.ru?.title ?? input.slug}» (черновик)`,
        changes: { rubric: input.rubric, branch: input.branchSlug, languages: Object.keys(input.translations) },
      });
      return tx.news.findUniqueOrThrow({ where: { id: n.id }, select: newsSelect });
    });
    return reply.status(201).send(out(row));
  });

  app.put('/admin/news/:id', async (request) => {
    const staff = newsStaff(request);
    const { id } = ids.parse(request.params);
    const before = await load(staff, id);
    requireGrant(staff, editPermission(before.publicationStatus), before.branchId);
    assertIfMatch(request, before.updatedAt);
    const input = newsInputSchema.parse(request.body);
    const refs = await resolveRefs(input);
    // Перенос в другой филиал тоже требует права в том филиале.
    requireGrant(staff, 'news:edit', refs.branchId);
    if (await slugTaken(input.slug, id)) throw new ApiError(409, 'CONFLICT', 'Slug is already used');
    const row = await db.$transaction(async (tx) => {
      await tx.news.update({ where: { id }, data: { slug: input.slug, ...refs, dataOrigin: input.dataOrigin, sourceUrl: input.sourceUrl, updatedById: staff.session.userId } });
      await writeTranslations(tx, id, input);
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'update', entityType: 'news', entityId: id,
        summary: `Изменена новость «${input.translations.ru?.title ?? input.slug}»`,
        changes: { slug: before.slug === input.slug ? undefined : { from: before.slug, to: input.slug }, languages: Object.keys(input.translations) },
      });
      return tx.news.findUniqueOrThrow({ where: { id }, select: newsSelect });
    });
    return out(row);
  });

  /** Публикация и снятие. Снятая новость (archived) пропадает с сайта и может быть опубликована снова. */
  app.post('/admin/news/:id/:action', async (request) => {
    const staff = newsStaff(request);
    const { id, action } = z.object({ id: z.uuid(), action: z.enum(['publish', 'unpublish']) }).parse(request.params);
    const before = await load(staff, id);
    requireGrant(staff, 'news:publish', before.branchId);
    assertIfMatch(request, before.updatedAt);
    if (action === 'unpublish' && !confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Unpublishing must be confirmed');
    const target: PublicationStatus = action === 'publish' ? 'published' : 'archived';
    const allowed = action === 'publish' ? before.publicationStatus !== 'published' : before.publicationStatus === 'published';
    if (!allowed) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `Cannot ${action} from ${before.publicationStatus}`);
    const row = await db.$transaction(async (tx) => {
      await tx.news.update({
        where: { id },
        data: { publicationStatus: target, updatedById: staff.session.userId, ...(action === 'publish' && !before.publishedAt ? { publishedAt: new Date() } : {}) },
      });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'status_change', entityType: 'news', entityId: id,
        summary: `Новость «${titleOf(before)}»: ${action === 'publish' ? 'опубликована' : 'снята с публикации'}`,
        changes: { status: { from: before.publicationStatus, to: target } },
      });
      return tx.news.findUniqueOrThrow({ where: { id }, select: newsSelect });
    });
    return out(row);
  });

  app.delete('/admin/news/:id', async (request, reply) => {
    const staff = newsStaff(request);
    const { id } = ids.parse(request.params);
    const before = await load(staff, id);
    requireGrant(staff, 'news:publish', before.branchId);
    if (!confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    await db.$transaction(async (tx) => {
      await tx.news.update({ where: { id }, data: { deletedAt: new Date(), updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'news', entityId: id, summary: `Удалена новость «${titleOf(before)}»` });
    });
    return reply.status(204).send();
  });
}
