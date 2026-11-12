import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  ABOUT_SECTIONS, LOCALES, STAFF_DATA_ORIGINS, publicationImageInputSchema, socialLinksInputSchema, staffContactInputSchema,
  type Locale, type StaffContactInput,
} from '@archive-vko/shared';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { requirePermission } from '../../http/staff.ts';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import { hasGrant } from '../auth/session.ts';
import { writeAudit } from '../audit/audit.ts';
import { aboutBodySchema } from '../content/site.routes.ts';
import { MASTER_BUCKET, ruFirst, sniffImage, syncTranslations } from './admin-common.ts';
import { blocksPlainText, parseMarkup, toMarkup } from './page-markup.ts';

/**
 * «Об архиве» в панели (ТЗ §5.2; F-023, F-021): разделы текста, сотрудники основного архива («Структура и
 * руководство»), ссылки на соцсети и фотогалерея учреждения. Читать — pages:edit; сохранять — pages:publish,
 * потому что изменения сразу видны на сайте; загружать фото — ещё assets:upload. Всё пишется в журнал.
 * Фото до проверки антивирусом и без описания для незрячих на сайт не попадает (public_about_gallery_v).
 */
const READ = 'pages:edit';
const WRITE = 'pages:publish';
const GALLERY_SLUG = 'about-archive';
const SECTION_KEYS: string[] = ABOUT_SECTIONS.map((s) => s.key);
const sectionKeySchema = z.object({ key: z.enum(SECTION_KEYS as [string, ...string[]]) });
const confirmSchema = z.object({ confirm: z.boolean().optional() });
const ids = z.object({ id: z.uuid() });
type Tx = Prisma.TransactionClient;

const sectionInputSchema = z.object({
  published: z.boolean(),
  actualizedAt: z.iso.date(),
  translations: z.partialRecord(z.enum(LOCALES), z.object({
    title: z.string().trim().min(2).max(200),
    lead: z.string().trim().max(1000).transform((v) => (v === '' ? null : v)).nullable(),
    markup: z.string().max(60_000),
  })),
}).refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru', 'title'], message: 'required' });

const staffSelect = {
  id: true, phone: true, email: true, sortOrder: true, publicationStatus: true, dataOrigin: true, updatedAt: true,
  translations: { select: { locale: true, fullName: true, position: true, department: true } },
} as const;
type StaffRow = Prisma.StaffContactGetPayload<{ select: typeof staffSelect }>;

const gallerySelect = {
  id: true,
  asset: { select: { id: true, originalFilename: true, mimeType: true, antivirusStatus: true, dataOrigin: true, translations: { select: { locale: true, altText: true, caption: true } } } },
} as const;
type GalleryRow = Prisma.GalleryItemGetPayload<{ select: typeof gallerySelect }>;


const staffOut = (s: StaffRow) => ({
  id: s.id, phone: s.phone, email: s.email, sortOrder: s.sortOrder, published: s.publicationStatus === 'published',
  dataOrigin: s.dataOrigin, updatedAt: s.updatedAt.toISOString(),
  translations: Object.fromEntries(s.translations.map((t) => [t.locale, { fullName: t.fullName, position: t.position, department: t.department ?? '' }])),
});

const galleryOut = (g: GalleryRow) => ({
  id: g.id, filename: g.asset.originalFilename, mimeType: g.asset.mimeType, antivirusStatus: g.asset.antivirusStatus, dataOrigin: g.asset.dataOrigin,
  translations: Object.fromEntries(g.asset.translations.map((t) => [t.locale, { altText: t.altText ?? '', caption: t.caption ?? '' }])),
});

export async function aboutAdminRoutes(app: FastifyInstance, { db, storage }: { db: PrismaClient; storage: ObjectStorage }): Promise<void> {
  const sectionKey = (params: unknown) => {
    const parsed = sectionKeySchema.safeParse({ key: (params as { '*': string })['*'] });
    if (!parsed.success) throw notFound();
    return parsed.data.key;
  };
  const mainBranch = () => db.branch.findFirst({ where: { isMain: true, deletedAt: null }, select: { id: true } });
  const galleryItems = () => db.galleryItem.findMany({ where: { gallery: { slug: GALLERY_SLUG } }, orderBy: { sortOrder: 'asc' }, select: gallerySelect });

  /** Сводка: какие разделы есть и видны, сотрудники, соцсети, фото. */
  app.get('/admin/about', async (request) => {
    const staff = requirePermission(request, READ);
    const [pages, main, social, photos] = await Promise.all([
      db.page.findMany({
        where: { key: { in: SECTION_KEYS }, deletedAt: null },
        select: { key: true, publicationStatus: true, updatedAt: true, translations: { select: { locale: true, title: true, translationStatus: true } } },
      }),
      mainBranch(),
      db.siteSetting.findUnique({ where: { key: 'social_links' } }),
      galleryItems(),
    ]);
    const people = main
      ? await db.staffContact.findMany({ where: { branchId: main.id, deletedAt: null }, orderBy: { sortOrder: 'asc' }, select: staffSelect })
      : [];
    const links = socialLinksInputSchema.shape.items.safeParse(social?.value);
    return {
      sections: ABOUT_SECTIONS.map((s) => {
        const page = pages.find((p) => p.key === s.key);
        return {
          key: s.key,
          title: page ? (ruFirst(page.translations)?.title ?? s.title) : s.title,
          exists: Boolean(page),
          published: page?.publicationStatus === 'published',
          languages: page?.translations.map((t) => t.locale) ?? [],
          updatedAt: page?.updatedAt.toISOString() ?? null,
        };
      }),
      staff: people.map(staffOut),
      hasMainBranch: Boolean(main),
      social: { items: links.success ? links.data : [], updatedAt: social?.updatedAt.toISOString() ?? null },
      gallery: photos.map(galleryOut),
      canPublish: staff.grants.global.has(WRITE),
      canUpload: staff.grants.global.has(WRITE) && hasGrant(staff.grants, 'assets:upload'),
    };
  });

  /* ---------- Разделы текста ---------- */

  app.get('/admin/about/sections/*', async (request) => {
    requirePermission(request, READ);
    const key = sectionKey(request.params);
    const page = await db.page.findFirst({ where: { key, deletedAt: null }, include: { translations: true } });
    const fallbackTitle = ABOUT_SECTIONS.find((s) => s.key === key)?.title ?? key;
    if (!page) return { key, exists: false, published: false, updatedAt: null, actualizedAt: null, translations: { ru: { title: fallbackTitle, lead: '', markup: '' } } };
    const ru = aboutBodySchema.safeParse(page.translations.find((t) => t.locale === 'ru')?.body);
    return {
      key,
      exists: true,
      published: page.publicationStatus === 'published',
      updatedAt: page.updatedAt.toISOString(),
      actualizedAt: ru.success ? ru.data.actualizedAt : null,
      translations: Object.fromEntries(page.translations.map((t) => {
        const body = aboutBodySchema.safeParse(t.body);
        return [t.locale, { title: t.title, lead: t.lead ?? '', markup: body.success ? toMarkup(body.data.blocks) : '' }];
      })),
    };
  });

  /** Сохранение раздела: создаёт страницу при первом сохранении; текст хранится в формате справочных страниц. */
  app.put('/admin/about/sections/*', async (request) => {
    const staff = requirePermission(request, WRITE);
    const key = sectionKey(request.params);
    const page = await db.page.findFirst({ where: { key, deletedAt: null }, include: { translations: true } });
    if (page) assertIfMatch(request, page.updatedAt);
    const input = sectionInputSchema.parse(request.body);
    const parsed = Object.entries(input.translations).map(([locale, t]) => ({ locale: locale as Locale, t, ...parseMarkup(t.markup) }));
    const issues = parsed.flatMap((p) => p.issues.map((i) => ({ path: ['translations', p.locale, 'markup', String(i.line)], code: 'markup', message: i.message })));
    if (issues.length) throw new ApiError(400, 'VALIDATION_FAILED', issues.map((i) => i.message).join('; '), issues.map(({ path, code }) => ({ path, code })));
    if (input.published && !parsed.find((p) => p.locale === 'ru')?.blocks.length) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Russian text is required to publish', [{ path: ['translations', 'ru', 'markup'], code: 'required' }]);
    }
    const status = input.published ? 'published' as const : 'draft' as const;
    const changed: string[] = [];
    const row = await db.$transaction(async (tx) => {
      const target = page
        ? await tx.page.update({ where: { id: page.id }, data: { publicationStatus: status, updatedById: staff.session.userId } })
        : await tx.page.create({
            data: { key, sortOrder: SECTION_KEYS.indexOf(key), publicationStatus: status, dataOrigin: 'verified', createdById: staff.session.userId, updatedById: staff.session.userId },
          });
      for (const locale of LOCALES) {
        const p = parsed.find((x) => x.locale === locale);
        const prev = page?.translations.find((x) => x.locale === locale);
        if (!p) {
          if (prev) {
            changed.push(locale);
            await tx.pageTranslation.delete({ where: { pageId_locale: { pageId: target.id, locale } } });
          }
          continue;
        }
        const body = { actualizedAt: input.actualizedAt, blocks: p.blocks };
        if (!prev || prev.title !== p.t.title || prev.lead !== p.t.lead || JSON.stringify(prev.body) !== JSON.stringify(body)) changed.push(locale);
        const data = { title: p.t.title, lead: p.t.lead, body, bodyText: blocksPlainText(p.blocks), translationStatus: 'reviewed' as const };
        await tx.pageTranslation.upsert({ where: { pageId_locale: { pageId: target.id, locale } }, update: data, create: { ...data, pageId: target.id, locale } });
      }
      // Время изменения страницы — после записи переводов: по нему следующая правка проверяет If-Match.
      const updated = await tx.page.update({ where: { id: target.id }, data: { updatedById: staff.session.userId } });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: page ? 'update' : 'create', entityType: 'page', entityId: target.id,
        summary: `«Об архиве», раздел «${input.translations.ru?.title ?? key}»: ${input.published ? 'на сайте' : 'скрыт'}${changed.length ? `, изменены языки ${changed.join(', ')}` : ''}`,
        changes: { key, published: input.published, languages: changed, actualizedAt: input.actualizedAt },
      });
      return updated;
    });
    return { key, exists: true, published: input.published, updatedAt: row.updatedAt.toISOString(), changed };
  });

  /* ---------- Сотрудники основного архива ---------- */

  const requireMain = async () => {
    const main = await mainBranch();
    if (!main) throw new ApiError(409, 'CONFLICT', 'Main archive branch is not set up');
    return main;
  };

  async function saveStaff(tx: Tx, id: string | null, branchId: string, input: StaffContactInput) {
    const data = {
      phone: input.phone, email: input.email, sortOrder: input.sortOrder, dataOrigin: input.dataOrigin,
      publicationStatus: input.published ? 'published' as const : 'draft' as const,
    };
    const row = id ? await tx.staffContact.update({ where: { id }, data }) : await tx.staffContact.create({ data: { ...data, branchId } });
    await syncTranslations(
      input.translations,
      (locale, t) => tx.staffContactTranslation.upsert({
        where: { staffContactId_locale: { staffContactId: row.id, locale } },
        update: { fullName: t.fullName, position: t.position, department: t.department, translationStatus: 'reviewed' },
        create: { staffContactId: row.id, locale, fullName: t.fullName, position: t.position, department: t.department, translationStatus: 'reviewed' },
      }),
      (locale) => tx.staffContactTranslation.deleteMany({ where: { staffContactId: row.id, locale } }),
    );
    return tx.staffContact.update({ where: { id: row.id }, data: { updatedAt: new Date() }, select: staffSelect });
  }

  async function loadStaff(id: string) {
    const main = await requireMain();
    const row = await db.staffContact.findFirst({ where: { id, branchId: main.id, deletedAt: null }, select: staffSelect });
    if (!row) throw notFound();
    return { main, row };
  }

  app.post('/admin/about/staff', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const input = staffContactInputSchema.parse(request.body);
    const main = await requireMain();
    const row = await db.$transaction(async (tx) => {
      const saved = await saveStaff(tx, null, main.id, input);
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'create', entityType: 'staff_contact', entityId: saved.id,
        summary: `Добавлен сотрудник «${input.translations.ru?.fullName ?? ''}» (${input.published ? 'на сайте' : 'скрыт'})`,
        changes: { published: input.published, languages: Object.keys(input.translations) },
      });
      return saved;
    });
    return reply.status(201).send(staffOut(row));
  });

  app.put('/admin/about/staff/:id', async (request) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    const { main, row: before } = await loadStaff(id);
    assertIfMatch(request, before.updatedAt);
    const input = staffContactInputSchema.parse(request.body);
    const row = await db.$transaction(async (tx) => {
      const saved = await saveStaff(tx, id, main.id, input);
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'update', entityType: 'staff_contact', entityId: id,
        summary: `Изменён сотрудник «${input.translations.ru?.fullName ?? ''}» (${input.published ? 'на сайте' : 'скрыт'})`,
        changes: { published: input.published, languages: Object.keys(input.translations) },
      });
      return saved;
    });
    return staffOut(row);
  });

  app.delete('/admin/about/staff/:id', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    if (!confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    const { row } = await loadStaff(id);
    await db.$transaction(async (tx) => {
      await tx.staffContact.update({ where: { id }, data: { deletedAt: new Date(), publicationStatus: 'archived' } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'staff_contact', entityId: id, summary: `Удалён сотрудник «${ruFirst(row.translations)?.fullName ?? id}»` });
    });
    return reply.status(204).send();
  });

  /* ---------- Соцсети ---------- */

  app.put('/admin/about/social', async (request) => {
    const staff = requirePermission(request, WRITE);
    const before = await db.siteSetting.findUnique({ where: { key: 'social_links' } });
    if (before) assertIfMatch(request, before.updatedAt);
    const input = socialLinksInputSchema.parse(request.body);
    const row = await db.$transaction(async (tx) => {
      const saved = await tx.siteSetting.upsert({ where: { key: 'social_links' }, update: { value: input.items }, create: { key: 'social_links', value: input.items } });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'update', entityType: 'site_setting', entityId: 'social_links',
        summary: `«Об архиве»: ссылки на соцсети (${input.items.map((i) => i.network).join(', ') || 'нет'})`,
        changes: { items: input.items },
      });
      return saved;
    });
    return { items: input.items, updatedAt: row.updatedAt.toISOString() };
  });

  /* ---------- Фотогалерея учреждения ---------- */

  function requireUpload(request: FastifyRequest) {
    const staff = requirePermission(request, WRITE);
    if (!hasGrant(staff.grants, 'assets:upload')) throw new ApiError(403, 'FORBIDDEN', 'Permission assets:upload required');
    return staff;
  }

  async function loadPhoto(request: FastifyRequest) {
    const { id } = ids.parse(request.params);
    const item = await db.galleryItem.findFirst({ where: { id, gallery: { slug: GALLERY_SLUG } }, select: gallerySelect });
    if (!item) throw notFound();
    return item;
  }
  const galleryResult = async () => ({ gallery: (await galleryItems()).map(galleryOut) });

  /**
   * Тело запроса — сам файл (JPEG, PNG, WebP), тип проверяется по сигнатуре. ?dataOrigin=demo помечает
   * демонстрационное фото. Файл ждёт антивируса; без описания для незрячих сайт его тоже не покажет.
   */
  app.post('/admin/about/gallery', async (request, reply) => {
    const staff = requireUpload(request);
    const { dataOrigin } = z.object({ dataOrigin: z.enum(STAFF_DATA_ORIGINS).default('verified') }).parse(request.query);
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new ApiError(400, 'VALIDATION_FAILED', 'File is required', [{ path: ['file'], code: 'required' }]);
    const mime = sniffImage(data);
    if (!mime) throw new ApiError(415, 'VALIDATION_FAILED', 'Only JPEG, PNG and WebP images are accepted', [{ path: ['file'], code: 'unsupported_type' }]);
    const count = await db.galleryItem.count({ where: { gallery: { slug: GALLERY_SLUG } } });
    if (count >= 100) throw new ApiError(400, 'VALIDATION_FAILED', 'Too many images', [{ path: ['gallery'], code: 'too_big' }]);
    const rawName = request.headers['x-filename'];
    const filename = (typeof rawName === 'string' ? decodeURIComponent(rawName) : 'image').replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 200) || 'image';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    const key = `about/${randomUUID()}.${ext}`;
    await storage.write(MASTER_BUCKET, key, data);
    await db.$transaction(async (tx) => {
      const gallery = await tx.gallery.upsert({
        where: { slug: GALLERY_SLUG },
        update: {},
        create: { slug: GALLERY_SLUG, publicationStatus: 'published', dataOrigin: 'verified', translations: { create: { locale: 'ru', title: 'Фотогалерея архива', translationStatus: 'reviewed' } } },
      });
      const asset = await tx.digitalAsset.create({
        data: {
          kind: 'image', storageBucket: MASTER_BUCKET, storageKey: key, originalFilename: filename, mimeType: mime,
          sizeBytes: BigInt(data.length), sha256: createHash('sha256').update(data).digest('hex'),
          accessLevel: 'open', dataOrigin, processingStatus: 'ready', antivirusStatus: 'pending', createdById: staff.session.userId,
        },
      });
      const last = await tx.galleryItem.aggregate({ where: { galleryId: gallery.id }, _max: { sortOrder: true } });
      await tx.galleryItem.create({ data: { galleryId: gallery.id, assetId: asset.id, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'upload', entityType: 'gallery', entityId: gallery.id,
        summary: `«Об архиве»: добавлено фото «${filename}» (${mime}${dataOrigin === 'demo' ? ', демонстрационное' : ''})`,
        changes: { assetId: asset.id, sizeBytes: data.length },
      });
    });
    return reply.status(201).send(await galleryResult());
  });

  app.put('/admin/about/gallery/:id', async (request) => {
    const staff = requirePermission(request, WRITE);
    const item = await loadPhoto(request);
    const input = publicationImageInputSchema.parse(request.body);
    await db.$transaction(async (tx) => {
      const assetId = item.asset.id;
      await syncTranslations(
        input.translations,
        (locale, t) => tx.assetTranslation.upsert({
          where: { assetId_locale: { assetId, locale } },
          update: { altText: t.altText, caption: t.caption, translationStatus: 'reviewed' },
          create: { assetId, locale, altText: t.altText, caption: t.caption, translationStatus: 'reviewed' },
        }),
        (locale) => tx.assetTranslation.deleteMany({ where: { assetId, locale } }),
      );
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'update', entityType: 'digital_asset', entityId: assetId,
        summary: `«Об архиве»: изменена подпись фото «${item.asset.originalFilename}»`,
        changes: { languages: Object.keys(input.translations) },
      });
    });
    return galleryResult();
  });

  /** Перестановка с соседом. Уникальный порядок в базе: через временное значение. */
  app.post('/admin/about/gallery/:id/move', async (request) => {
    const staff = requirePermission(request, WRITE);
    const item = await loadPhoto(request);
    const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(request.body);
    const all = await galleryItems();
    const index = all.findIndex((i) => i.id === item.id);
    const neighbour = all[direction === 'up' ? index - 1 : index + 1];
    if (!neighbour) throw new ApiError(409, 'CONFLICT', 'Image is already at the edge');
    await db.$transaction(async (tx) => {
      const [a, b] = await Promise.all([
        tx.galleryItem.findUniqueOrThrow({ where: { id: item.id }, select: { sortOrder: true } }),
        tx.galleryItem.findUniqueOrThrow({ where: { id: neighbour.id }, select: { sortOrder: true } }),
      ]);
      await tx.galleryItem.update({ where: { id: item.id }, data: { sortOrder: -1 } });
      await tx.galleryItem.update({ where: { id: neighbour.id }, data: { sortOrder: a.sortOrder } });
      await tx.galleryItem.update({ where: { id: item.id }, data: { sortOrder: b.sortOrder } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'update', entityType: 'gallery', summary: `«Об архиве»: изменён порядок фото («${item.asset.originalFilename}»)` });
    });
    return galleryResult();
  });

  app.delete('/admin/about/gallery/:id', async (request) => {
    const staff = requirePermission(request, WRITE);
    const item = await loadPhoto(request);
    if (!confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    await db.$transaction(async (tx) => {
      await tx.galleryItem.delete({ where: { id: item.id } });
      await tx.digitalAsset.update({ where: { id: item.asset.id }, data: { deletedAt: new Date() } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'digital_asset', entityId: item.asset.id, summary: `«Об архиве»: удалено фото «${item.asset.originalFilename}»` });
    });
    return galleryResult();
  });

  /** Предпросмотр для сотрудников, в том числе до проверки антивирусом. */
  app.get('/admin/about/gallery/:id', async (request, reply) => {
    requirePermission(request, READ);
    const item = await loadPhoto(request);
    const asset = await db.digitalAsset.findFirst({ where: { id: item.asset.id, deletedAt: null }, select: { storageBucket: true, storageKey: true, mimeType: true } });
    const body = asset ? await storage.read(asset.storageBucket, asset.storageKey) : null;
    if (!asset || !body) throw notFound();
    return reply
      .header('Content-Type', asset.mimeType)
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
      .header('Cache-Control', 'no-store')
      .send(body);
  });
}
