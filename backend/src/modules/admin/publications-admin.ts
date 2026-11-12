import type { Prisma, PrismaClient, PublicationStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PUBLICATION_KINDS, publicationImageInputSchema, publicationInputSchema, type PublicationInput } from '@archive-vko/shared';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { requirePermission, type Staff } from '../../http/staff.ts';
import type { ObjectStorage } from '../../infrastructure/storage/local-storage.ts';
import { hasGrant } from '../auth/session.ts';
import { writeAudit } from '../audit/audit.ts';
import { MASTER_BUCKET, ruFirst, sniffImage, syncTranslations } from './admin-common.ts';

/**
 * Публикации «Цифровой истории» в панели (ТЗ §5.6, §6.6; F-149).
 * publications:edit — создавать и править черновики; publications:publish — публиковать, править опубликованное
 * (правка сразу видна на сайте) и удалять. Связанный документ можно указать любой существующий: закрытый
 * сайт не покажет, панель предупреждает об этом. Личности и события привязываются по id; на сайте видны
 * только опубликованные. Текст хранится абзацами без HTML; каждое изменение пишется в журнал.
 */
const READ = 'publications:edit';
const PUBLISH = 'publications:publish';
const ids = z.object({ id: z.uuid() });
const confirmSchema = z.object({ confirm: z.boolean().optional() });
type Tx = Prisma.TransactionClient;

const select = {
  id: true, slug: true, kind: true, periodText: true, yearFrom: true, yearTo: true, sourceNote: true, authorship: true,
  documentId: true, isFeatured: true, publishedAt: true, publicationStatus: true, dataOrigin: true, sourceUrl: true, updatedAt: true,
  coverAssetId: true,
  images: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true, asset: { select: { id: true, originalFilename: true, mimeType: true, antivirusStatus: true, translations: { select: { locale: true, altText: true, caption: true } } } } },
  },
  translations: { select: { locale: true, title: true, lead: true, bodyText: true, coverAlt: true } },
  categories: { select: { category: { select: { slug: true, kind: true } } } },
  settlements: { select: { settlement: { select: { slug: true } } } },
  persons: { select: { personId: true } },
  events: { select: { eventId: true } },
} as const;
type Row = Prisma.PublicationGetPayload<{ select: typeof select }>;

const titleOf = (p: Row) => ruFirst(p.translations)?.title ?? p.slug;
const paragraphs = (text: string) => ({ paragraphs: text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean) });
const invalid = (path: Array<string | number>, message: string) => new ApiError(400, 'VALIDATION_FAILED', message, [{ path, code: 'unknown' }]);

export async function publicationsAdminRoutes(app: FastifyInstance, { db, storage }: { db: PrismaClient; storage: ObjectStorage }): Promise<void> {
  /** Видна ли публикация на сайте сейчас и виден ли связанный документ (через public_documents_v). */
  async function out(p: Row) {
    const cover = p.coverAssetId
      ? await db.digitalAsset.findFirst({ where: { id: p.coverAssetId, deletedAt: null }, select: { mimeType: true, originalFilename: true, antivirusStatus: true } })
      : null;
    const [doc, publicDoc] = p.documentId
      ? await Promise.all([
          db.document.findUnique({ where: { id: p.documentId }, select: { translations: { select: { locale: true, title: true } } } }),
          db.$queryRaw<Array<{ id: string }>>`SELECT id FROM public_documents_v WHERE id = ${p.documentId}::uuid`,
        ])
      : [null, []];
    return {
      id: p.id,
      slug: p.slug,
      kind: p.kind,
      periodText: p.periodText,
      yearFrom: p.yearFrom,
      yearTo: p.yearTo,
      published: p.publicationStatus === 'published',
      featured: p.isFeatured,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      dataOrigin: p.dataOrigin,
      sourceNote: p.sourceNote,
      authorship: p.authorship,
      sourceUrl: p.sourceUrl,
      document: p.documentId ? { id: p.documentId, title: doc ? (ruFirst(doc.translations)?.title ?? null) : null, visible: publicDoc.length > 0 } : null,
      // Обложка видна на сайте только после проверки антивирусом (public_publication_covers_v).
      cover: cover ? { filename: cover.originalFilename, mimeType: cover.mimeType, antivirusStatus: cover.antivirusStatus } : null,
      images: p.images.map((i) => ({
        id: i.id, filename: i.asset.originalFilename, mimeType: i.asset.mimeType, antivirusStatus: i.asset.antivirusStatus,
        translations: Object.fromEntries(i.asset.translations.map((t) => [t.locale, { altText: t.altText ?? '', caption: t.caption ?? '' }])),
      })),
      topics: p.categories.filter((c) => c.category.kind === 'history_topic').map((c) => c.category.slug),
      settlements: p.settlements.map((s) => s.settlement.slug),
      personIds: p.persons.map((x) => x.personId),
      eventIds: p.events.map((x) => x.eventId),
      updatedAt: p.updatedAt.toISOString(),
      title: titleOf(p),
      translations: Object.fromEntries(p.translations.map((t) => [t.locale, { title: t.title, lead: t.lead ?? '', bodyText: t.bodyText ?? '', coverAlt: t.coverAlt ?? '' }])),
    };
  }

  async function load(id: string): Promise<Row> {
    const row = await db.publication.findFirst({ where: { id, deletedAt: null }, select });
    if (!row) throw notFound();
    return row;
  }

  /** Публиковать, править опубликованное и снимать с публикации может только сотрудник с правом публикации. */
  function requireWrite(staff: Staff, before: PublicationStatus | null, input: PublicationInput) {
    const needsPublish = input.published || before === 'published';
    if (needsPublish && !staff.grants.global.has(PUBLISH)) throw new ApiError(403, 'FORBIDDEN', `Permission ${PUBLISH} required`);
  }

  /** Справочные значения → id; неизвестное значение — 400 с путём поля. */
  async function resolveRefs(input: PublicationInput) {
    const [topics, settlements, doc, persons, events] = await Promise.all([
      db.category.findMany({ where: { kind: 'history_topic', slug: { in: input.topics } }, select: { id: true, slug: true } }),
      db.settlement.findMany({ where: { slug: { in: input.settlements } }, select: { id: true, slug: true } }),
      input.documentId ? db.document.findFirst({ where: { id: input.documentId, deletedAt: null }, select: { id: true } }) : Promise.resolve(null),
      db.historicalPerson.findMany({ where: { id: { in: input.personIds }, deletedAt: null }, select: { id: true } }),
      db.historicalEvent.findMany({ where: { id: { in: input.eventIds }, deletedAt: null }, select: { id: true } }),
    ]);
    const missing = <T>(list: readonly T[], known: Set<T>) => list.findIndex((x) => !known.has(x));
    const checks: Array<[string, number]> = [
      ['topics', missing(input.topics, new Set(topics.map((x) => x.slug)))],
      ['settlements', missing(input.settlements, new Set(settlements.map((x) => x.slug)))],
      ['personIds', missing(input.personIds, new Set(persons.map((x) => x.id)))],
      ['eventIds', missing(input.eventIds, new Set(events.map((x) => x.id)))],
    ];
    for (const [field, index] of checks) if (index >= 0) throw invalid([field, index], `Unknown ${field}`);
    if (input.documentId && !doc) throw invalid(['documentId'], 'Unknown document');
    const idOf = (list: Array<{ id: string; slug: string }>, slug: string) => list.find((x) => x.slug === slug)?.id ?? '';
    return {
      topicIds: input.topics.map((s) => idOf(topics, s)),
      settlementIds: input.settlements.map((s) => idOf(settlements, s)),
    };
  }

  async function slugTaken(slug: string, exceptId: string | null) {
    const other = await db.publication.findUnique({ where: { slug }, select: { id: true } });
    return other !== null && other.id !== exceptId;
  }

  async function save(tx: Tx, before: Row | null, input: PublicationInput, refs: Awaited<ReturnType<typeof resolveRefs>>, userId: string, request: FastifyRequest) {
    const status: PublicationStatus = input.published ? 'published' : before?.publicationStatus === 'published' ? 'archived' : (before?.publicationStatus ?? 'draft');
    const data = {
      slug: input.slug, kind: input.kind, periodText: input.periodText, yearFrom: input.yearFrom, yearTo: input.yearTo,
      sourceNote: input.sourceNote, authorship: input.authorship, sourceUrl: input.sourceUrl, documentId: input.documentId,
      isFeatured: input.featured, dataOrigin: input.dataOrigin, publicationStatus: status, updatedById: userId,
      // Дата публикации ставится при первой публикации и дальше не меняется.
      ...(input.published && !before?.publishedAt ? { publishedAt: new Date() } : {}),
    };
    const row = before ? await tx.publication.update({ where: { id: before.id }, data }) : await tx.publication.create({ data: { ...data, createdById: userId } });
    const id = row.id;
    await syncTranslations(
      input.translations,
      (locale, t) => {
        const text = { title: t.title, lead: t.lead, bodyText: t.bodyText, body: paragraphs(t.bodyText), coverAlt: t.coverAlt, translationStatus: 'reviewed' as const };
        return tx.publicationTranslation.upsert({ where: { publicationId_locale: { publicationId: id, locale } }, update: text, create: { ...text, publicationId: id, locale } });
      },
      (locale) => tx.publicationTranslation.deleteMany({ where: { publicationId: id, locale } }),
    );
    // Связи пересобираются целиком: тематики (только history_topic), места, личности, события.
    await tx.publicationCategory.deleteMany({ where: { publicationId: id, category: { kind: 'history_topic' } } });
    await tx.publicationCategory.createMany({ data: refs.topicIds.map((categoryId) => ({ publicationId: id, categoryId })) });
    await tx.publicationSettlement.deleteMany({ where: { publicationId: id } });
    await tx.publicationSettlement.createMany({ data: refs.settlementIds.map((settlementId) => ({ publicationId: id, settlementId })) });
    await tx.publicationPerson.deleteMany({ where: { publicationId: id } });
    await tx.publicationPerson.createMany({ data: input.personIds.map((personId) => ({ publicationId: id, personId })) });
    await tx.publicationEvent.deleteMany({ where: { publicationId: id } });
    await tx.publicationEvent.createMany({ data: input.eventIds.map((eventId) => ({ publicationId: id, eventId })) });
    const statusText = status === 'published' ? 'опубликована' : status === 'archived' ? 'снята с сайта' : 'черновик';
    await writeAudit(tx, request, {
      userId, action: before ? 'update' : 'create', entityType: 'publication', entityId: id,
      summary: `${before ? 'Изменена' : 'Добавлена'} публикация «${input.translations.ru?.title ?? input.slug}» (${statusText})`,
      changes: {
        status: before && before.publicationStatus !== status ? { from: before.publicationStatus, to: status } : undefined,
        slug: before && before.slug !== input.slug ? { from: before.slug, to: input.slug } : undefined,
        languages: Object.keys(input.translations), topics: input.topics, settlements: input.settlements,
        persons: input.personIds.length, events: input.eventIds.length, document: input.documentId,
      },
    });
    return tx.publication.findUniqueOrThrow({ where: { id }, select });
  }

  app.get('/admin/memory/publications', async (request) => {
    const staff = requirePermission(request, READ);
    const [rows, topics, settlements] = await Promise.all([
      db.publication.findMany({ where: { deletedAt: null }, orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }], select }),
      db.category.findMany({ where: { kind: 'history_topic' }, orderBy: { sortOrder: 'asc' }, select: { slug: true, translations: { select: { locale: true, name: true } } } }),
      db.settlement.findMany({ select: { slug: true, translations: { select: { locale: true, name: true } } } }),
    ]);
    const named = (list: Array<{ slug: string; translations: Array<{ locale: string; name: string }> }>) =>
      list.map((x) => ({ slug: x.slug, name: ruFirst(x.translations)?.name ?? x.slug }));
    return {
      items: await Promise.all(rows.map(out)),
      kinds: PUBLICATION_KINDS,
      topics: named(topics),
      settlements: named(settlements).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      canPublish: staff.grants.global.has(PUBLISH),
    };
  });

  app.get('/admin/memory/publications/:id', async (request) => {
    requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    return out(await load(id));
  });

  app.post('/admin/memory/publications', async (request, reply) => {
    const staff = requirePermission(request, READ);
    const input = publicationInputSchema.parse(request.body);
    requireWrite(staff, null, input);
    const refs = await resolveRefs(input);
    if (await slugTaken(input.slug, null)) throw new ApiError(409, 'CONFLICT', 'Slug is already used');
    const row = await db.$transaction((tx) => save(tx, null, input, refs, staff.session.userId, request));
    return reply.status(201).send(await out(row));
  });

  app.put('/admin/memory/publications/:id', async (request) => {
    const staff = requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    const before = await load(id);
    assertIfMatch(request, before.updatedAt);
    const input = publicationInputSchema.parse(request.body);
    requireWrite(staff, before.publicationStatus, input);
    // Опубликованная обложка должна быть описана для незрячих хотя бы по-русски.
    if (input.published && before.coverAssetId && !input.translations.ru?.coverAlt) throw invalid(['translations', 'ru', 'coverAlt'], 'Cover description is required');
    // Каждое фото опубликованной публикации тоже должно быть описано по-русски.
    if (input.published) {
      const undescribed = before.images.findIndex((i) => !i.asset.translations.some((t) => t.locale === 'ru' && t.altText));
      if (undescribed >= 0) throw invalid(['images', undescribed, 'altText'], 'Image description is required');
    }
    const refs = await resolveRefs(input);
    if (await slugTaken(input.slug, id)) throw new ApiError(409, 'CONFLICT', 'Slug is already used');
    return out(await db.$transaction((tx) => save(tx, before, input, refs, staff.session.userId, request)));
  });

  app.delete('/admin/memory/publications/:id', async (request, reply) => {
    const staff = requirePermission(request, PUBLISH);
    const { id } = ids.parse(request.params);
    const before = await load(id);
    if (!confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    await db.$transaction(async (tx) => {
      await tx.publication.update({ where: { id }, data: { deletedAt: new Date(), updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'publication', entityId: id, summary: `Удалена публикация «${titleOf(before)}»` });
    });
    return reply.status(204).send();
  });

  /** Файл из тела запроса: проверка сигнатуры, безопасное имя, запись в закрытый бакет мастер-копий. */
  async function storeUpload(request: FastifyRequest, publicationId: string) {
    const data = request.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new ApiError(400, 'VALIDATION_FAILED', 'File is required', [{ path: ['file'], code: 'required' }]);
    const mime = sniffImage(data);
    if (!mime) throw new ApiError(415, 'VALIDATION_FAILED', 'Only JPEG, PNG and WebP images are accepted', [{ path: ['file'], code: 'unsupported_type' }]);
    const rawName = request.headers['x-filename'];
    const filename = (typeof rawName === 'string' ? decodeURIComponent(rawName) : 'image').replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 200) || 'image';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    const key = `publications/${publicationId}/${randomUUID()}.${ext}`;
    await storage.write(MASTER_BUCKET, key, data);
    return { data, mime, filename, key };
  }

  /** Файл ждёт антивируса (pending): до проверки сайт его не показывает. */
  const createAsset = (tx: Tx, file: Awaited<ReturnType<typeof storeUpload>>, owner: Row, userId: string) =>
    tx.digitalAsset.create({
      data: {
        kind: 'image', storageBucket: MASTER_BUCKET, storageKey: file.key, originalFilename: file.filename, mimeType: file.mime,
        sizeBytes: BigInt(file.data.length), sha256: createHash('sha256').update(file.data).digest('hex'), sourceNote: owner.sourceNote,
        accessLevel: 'open', dataOrigin: owner.dataOrigin, processingStatus: 'ready', antivirusStatus: 'pending', createdById: userId,
      },
    });

  /** Права на файлы публикации: правка и загрузка; у опубликованной — ещё публикация (изменение сразу на сайте). */
  function requireFileWrite(request: FastifyRequest, before: Row, upload: boolean) {
    const staff = requirePermission(request, READ);
    if (upload && !hasGrant(staff.grants, 'assets:upload')) throw new ApiError(403, 'FORBIDDEN', 'Permission assets:upload required');
    if (before.publicationStatus === 'published' && !staff.grants.global.has(PUBLISH)) throw new ApiError(403, 'FORBIDDEN', `Permission ${PUBLISH} required`);
    return staff;
  }

  /**
   * Обложка публикации: тело запроса — сам файл (JPEG, PNG, WebP), тип проверяется по сигнатуре.
   * Нужны права правки и загрузки файлов; у опубликованной публикации — ещё право публикации.
   * Файл ложится в закрытый бакет со статусом «ожидает проверки антивирусом» и на сайте не виден до проверки.
   */
  app.post('/admin/memory/publications/:id/cover', async (request, reply) => {
    requirePermission(request, READ); // до разбора адреса: без прав — сразу 403
    const { id } = ids.parse(request.params);
    const before = await load(id);
    const staff = requireFileWrite(request, before, true);
    const file = await storeUpload(request, id);
    const row = await db.$transaction(async (tx) => {
      const asset = await createAsset(tx, file, before, staff.session.userId);
      // Прежняя обложка больше не нужна: мягкое удаление файла.
      if (before.coverAssetId) await tx.digitalAsset.update({ where: { id: before.coverAssetId }, data: { deletedAt: new Date() } });
      await tx.publication.update({ where: { id }, data: { coverAssetId: asset.id, updatedById: staff.session.userId } });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'upload', entityType: 'publication', entityId: id,
        summary: `Загружена обложка публикации «${titleOf(before)}» («${file.filename}», ${file.mime})`,
        changes: { assetId: asset.id, replaced: before.coverAssetId, sizeBytes: file.data.length },
      });
      return tx.publication.findUniqueOrThrow({ where: { id }, select });
    });
    return reply.status(201).send(await out(row));
  });

  app.delete('/admin/memory/publications/:id/cover', async (request) => {
    requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    const before = await load(id);
    const staff = requireFileWrite(request, before, false);
    if (!before.coverAssetId) throw notFound();
    if (!confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    const coverId = before.coverAssetId;
    const row = await db.$transaction(async (tx) => {
      await tx.digitalAsset.update({ where: { id: coverId }, data: { deletedAt: new Date() } });
      await tx.publication.update({ where: { id }, data: { coverAssetId: null, updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'publication', entityId: id, summary: `Удалена обложка публикации «${titleOf(before)}»`, changes: { assetId: coverId } });
      return tx.publication.findUniqueOrThrow({ where: { id }, select });
    });
    return out(row);
  });

  /** Предпросмотр обложки для сотрудников, в том числе до проверки антивирусом. */
  app.get('/admin/memory/publications/:id/cover', async (request, reply) => {
    requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    const { coverAssetId } = await load(id);
    const asset = coverAssetId ? await db.digitalAsset.findFirst({ where: { id: coverAssetId, deletedAt: null }, select: { storageBucket: true, storageKey: true, mimeType: true } }) : null;
    const body = asset ? await storage.read(asset.storageBucket, asset.storageKey) : null;
    if (!asset || !body) throw notFound();
    return reply
      .header('Content-Type', asset.mimeType)
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
      .header('Cache-Control', 'no-store')
      .send(body);
  });

  /* ---------- Фото внутри публикации (фотоистория) ---------- */
  const imageIds = z.object({ id: z.uuid(), imageId: z.uuid() });
  async function loadImage(request: FastifyRequest) {
    const { id, imageId } = imageIds.parse(request.params);
    const before = await load(id);
    const image = before.images.find((i) => i.id === imageId);
    if (!image) throw notFound();
    return { id, before, image };
  }
  const imageLabel = (image: Row['images'][number]) => image.asset.originalFilename;

  /** Новое фото встаёт в конец. Подпись и описание задаются отдельно; без описания опубликовать нельзя. */
  app.post('/admin/memory/publications/:id/images', async (request, reply) => {
    requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    const before = await load(id);
    const staff = requireFileWrite(request, before, true);
    if (before.images.length >= 50) throw new ApiError(400, 'VALIDATION_FAILED', 'Too many images', [{ path: ['images'], code: 'too_big' }]);
    const file = await storeUpload(request, id);
    const row = await db.$transaction(async (tx) => {
      const asset = await createAsset(tx, file, before, staff.session.userId);
      const last = await tx.publicationImage.aggregate({ where: { publicationId: id }, _max: { sortOrder: true } });
      await tx.publicationImage.create({ data: { publicationId: id, assetId: asset.id, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
      await tx.publication.update({ where: { id }, data: { updatedById: staff.session.userId } });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'upload', entityType: 'publication', entityId: id,
        summary: `Добавлено фото в публикацию «${titleOf(before)}» («${file.filename}», ${file.mime})`,
        changes: { assetId: asset.id, sizeBytes: file.data.length },
      });
      return tx.publication.findUniqueOrThrow({ where: { id }, select });
    });
    return reply.status(201).send(await out(row));
  });

  app.put('/admin/memory/publications/:id/images/:imageId', async (request) => {
    requirePermission(request, READ);
    const { id, before, image } = await loadImage(request);
    const staff = requireFileWrite(request, before, false);
    const input = publicationImageInputSchema.parse(request.body);
    const row = await db.$transaction(async (tx) => {
      const assetId = image.asset.id;
      await syncTranslations(
        input.translations,
        (locale, t) => tx.assetTranslation.upsert({
          where: { assetId_locale: { assetId, locale } },
          update: { altText: t.altText, caption: t.caption, translationStatus: 'reviewed' },
          create: { assetId, locale, altText: t.altText, caption: t.caption, translationStatus: 'reviewed' },
        }),
        (locale) => tx.assetTranslation.deleteMany({ where: { assetId, locale } }),
      );
      await tx.publication.update({ where: { id }, data: { updatedById: staff.session.userId } });
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'update', entityType: 'publication', entityId: id,
        summary: `Изменена подпись фото «${imageLabel(image)}» в публикации «${titleOf(before)}»`,
        changes: { assetId, languages: Object.keys(input.translations) },
      });
      return tx.publication.findUniqueOrThrow({ where: { id }, select });
    });
    return out(row);
  });

  /** Перестановка с соседом. Уникальный порядок в базе: через временное значение. */
  app.post('/admin/memory/publications/:id/images/:imageId/move', async (request) => {
    requirePermission(request, READ);
    const { id, before, image } = await loadImage(request);
    const staff = requireFileWrite(request, before, false);
    const { direction } = z.object({ direction: z.enum(['up', 'down']) }).parse(request.body);
    const index = before.images.findIndex((i) => i.id === image.id);
    const neighbour = before.images[direction === 'up' ? index - 1 : index + 1];
    if (!neighbour) throw new ApiError(409, 'CONFLICT', 'Image is already at the edge');
    const row = await db.$transaction(async (tx) => {
      const [a, b] = await Promise.all([
        tx.publicationImage.findUniqueOrThrow({ where: { id: image.id }, select: { sortOrder: true } }),
        tx.publicationImage.findUniqueOrThrow({ where: { id: neighbour.id }, select: { sortOrder: true } }),
      ]);
      await tx.publicationImage.update({ where: { id: image.id }, data: { sortOrder: -1 } });
      await tx.publicationImage.update({ where: { id: neighbour.id }, data: { sortOrder: a.sortOrder } });
      await tx.publicationImage.update({ where: { id: image.id }, data: { sortOrder: b.sortOrder } });
      await tx.publication.update({ where: { id }, data: { updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'update', entityType: 'publication', entityId: id, summary: `Изменён порядок фото в публикации «${titleOf(before)}»` });
      return tx.publication.findUniqueOrThrow({ where: { id }, select });
    });
    return out(row);
  });

  app.delete('/admin/memory/publications/:id/images/:imageId', async (request) => {
    requirePermission(request, READ);
    const { id, before, image } = await loadImage(request);
    const staff = requireFileWrite(request, before, false);
    if (!confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
    const row = await db.$transaction(async (tx) => {
      await tx.publicationImage.delete({ where: { id: image.id } });
      await tx.digitalAsset.update({ where: { id: image.asset.id }, data: { deletedAt: new Date() } });
      await tx.publication.update({ where: { id }, data: { updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'publication', entityId: id, summary: `Удалено фото «${imageLabel(image)}» из публикации «${titleOf(before)}»`, changes: { assetId: image.asset.id } });
      return tx.publication.findUniqueOrThrow({ where: { id }, select });
    });
    return out(row);
  });

  /** Предпросмотр фото для сотрудников, в том числе до проверки антивирусом. */
  app.get('/admin/memory/publications/:id/images/:imageId', async (request, reply) => {
    requirePermission(request, READ);
    const { image } = await loadImage(request);
    const asset = await db.digitalAsset.findFirst({ where: { id: image.asset.id, deletedAt: null }, select: { storageBucket: true, storageKey: true, mimeType: true } });
    const body = asset ? await storage.read(asset.storageBucket, asset.storageKey) : null;
    if (!asset || !body) throw notFound();
    return reply
      .header('Content-Type', asset.mimeType)
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox")
      .header('Cache-Control', 'no-store')
      .send(body);
  });
}
