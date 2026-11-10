import type { Prisma, PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  LOCALES, collectionInputSchema, personInputSchema, timelineEventInputSchema,
  type CollectionInput, type PersonInput, type TimelineEventInput,
} from '@archive-vko/shared';
import { ApiError, assertIfMatch, notFound } from '../../http/errors.ts';
import { requirePermission } from '../../http/staff.ts';
import { writeAudit } from '../audit/audit.ts';
import { ruFirst } from './admin-common.ts';

/**
 * «Архив памяти» в панели (ТЗ §6.6, F-149): события хронологии, исторические личности, коллекции.
 * Читать — publications:edit; сохранять и удалять — publications:publish, потому что опубликованная запись
 * меняется на сайте сразу. Каждое изменение пишется в журнал в той же транзакции; одновременная правка
 * ловится по If-Match. Удаление мягкое и требует подтверждения.
 */
const READ = 'publications:edit';
const WRITE = 'publications:publish';
const ids = z.object({ id: z.uuid() });
const confirmSchema = z.object({ confirm: z.boolean().optional() });
type Tx = Prisma.TransactionClient;
type Request = FastifyRequest;

const status = (published: boolean) => (published ? ('published' as const) : ('draft' as const));
const requireConfirm = (request: Request) => {
  if (!confirmSchema.parse(request.body ?? {}).confirm) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Deletion must be confirmed');
};
const slugConflict = () => new ApiError(409, 'CONFLICT', 'Slug is already used');

/** Перевод на каждый язык: есть во вводе — upsert, нет — удаление. */
async function syncTranslations<T>(
  locales: Partial<Record<(typeof LOCALES)[number], T>>,
  upsert: (locale: (typeof LOCALES)[number], value: T) => Promise<unknown>,
  remove: (locale: (typeof LOCALES)[number]) => Promise<unknown>,
) {
  for (const locale of LOCALES) {
    const value = locales[locale];
    await (value ? upsert(locale, value) : remove(locale));
  }
}

export async function memoryAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  /* ---------- События хронологии ---------- */
  const eventSelect = {
    id: true, slug: true, year: true, eventDate: true, publicationStatus: true, dataOrigin: true, sourceNote: true, updatedAt: true,
    translations: { select: { locale: true, title: true, description: true } },
  } as const;
  type EventRow = Prisma.HistoricalEventGetPayload<{ select: typeof eventSelect }>;
  const eventOut = (e: EventRow) => ({
    id: e.id, slug: e.slug, year: e.year, date: e.eventDate?.toISOString().slice(0, 10) ?? null,
    published: e.publicationStatus === 'published', dataOrigin: e.dataOrigin, sourceNote: e.sourceNote, updatedAt: e.updatedAt.toISOString(),
    title: ruFirst(e.translations)?.title ?? e.slug,
    translations: Object.fromEntries(e.translations.map((t) => [t.locale, { title: t.title, description: t.description ?? '' }])),
  });

  async function saveEvent(tx: Tx, id: string | null, input: TimelineEventInput, userId: string, request: Request) {
    const data = {
      slug: input.slug, year: input.year, eventDate: input.date ? new Date(`${input.date}T00:00:00Z`) : null,
      datePrecision: input.date ? ('day' as const) : ('year' as const), publicationStatus: status(input.published),
      dataOrigin: input.dataOrigin, sourceNote: input.sourceNote, updatedById: userId,
    };
    const row = id ? await tx.historicalEvent.update({ where: { id }, data }) : await tx.historicalEvent.create({ data: { ...data, createdById: userId } });
    await syncTranslations(
      input.translations,
      (locale, t) => tx.historicalEventTranslation.upsert({
        where: { eventId_locale: { eventId: row.id, locale } },
        update: { title: t.title, description: t.description, translationStatus: 'reviewed' },
        create: { eventId: row.id, locale, title: t.title, description: t.description, translationStatus: 'reviewed' },
      }),
      (locale) => tx.historicalEventTranslation.deleteMany({ where: { eventId: row.id, locale } }),
    );
    await writeAudit(tx, request, {
      userId, action: id ? 'update' : 'create', entityType: 'historical_event', entityId: row.id,
      summary: `${id ? 'Изменено' : 'Добавлено'} событие хронологии «${input.translations.ru?.title ?? input.slug}» (${input.year}, ${input.published ? 'опубликовано' : 'черновик'})`,
      changes: { year: input.year, date: input.date, published: input.published, languages: Object.keys(input.translations) },
    });
    return tx.historicalEvent.findUniqueOrThrow({ where: { id: row.id }, select: eventSelect });
  }

  const eventSlugTaken = async (slug: string, except: string | null) => {
    const other = await db.historicalEvent.findUnique({ where: { slug }, select: { id: true } });
    return other !== null && other.id !== except;
  };

  app.get('/admin/memory/events', async (request) => {
    requirePermission(request, READ);
    const rows = await db.historicalEvent.findMany({ where: { deletedAt: null }, orderBy: [{ year: 'asc' }, { eventDate: { sort: 'asc', nulls: 'first' } }], select: eventSelect });
    return { items: rows.map(eventOut) };
  });

  app.get('/admin/memory/events/:id', async (request) => {
    requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    const row = await db.historicalEvent.findFirst({ where: { id, deletedAt: null }, select: eventSelect });
    if (!row) throw notFound();
    return eventOut(row);
  });

  app.post('/admin/memory/events', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const input = timelineEventInputSchema.parse(request.body);
    if (await eventSlugTaken(input.slug, null)) throw slugConflict();
    const row = await db.$transaction((tx) => saveEvent(tx, null, input, staff.session.userId, request));
    return reply.status(201).send(eventOut(row));
  });

  app.put('/admin/memory/events/:id', async (request) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    const current = await db.historicalEvent.findFirst({ where: { id, deletedAt: null }, select: { updatedAt: true } });
    if (!current) throw notFound();
    assertIfMatch(request, current.updatedAt);
    const input = timelineEventInputSchema.parse(request.body);
    if (await eventSlugTaken(input.slug, id)) throw slugConflict();
    return eventOut(await db.$transaction((tx) => saveEvent(tx, id, input, staff.session.userId, request)));
  });

  app.delete('/admin/memory/events/:id', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    const row = await db.historicalEvent.findFirst({ where: { id, deletedAt: null }, select: eventSelect });
    if (!row) throw notFound();
    requireConfirm(request);
    await db.$transaction(async (tx) => {
      await tx.historicalEvent.update({ where: { id }, data: { deletedAt: new Date(), updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'historical_event', entityId: id, summary: `Удалено событие хронологии «${eventOut(row).title}»` });
    });
    return reply.status(204).send();
  });

  /* ---------- Исторические личности ---------- */
  const personSelect = {
    id: true, slug: true, birthYear: true, deathYear: true, publicationStatus: true, dataOrigin: true, sourceNote: true, updatedAt: true,
    translations: { select: { locale: true, fullName: true, biography: true } },
    _count: { select: { memorableDates: true } },
  } as const;
  type PersonRow = Prisma.HistoricalPersonGetPayload<{ select: typeof personSelect }>;
  const personOut = (p: PersonRow) => ({
    id: p.id, slug: p.slug, birthYear: p.birthYear, deathYear: p.deathYear,
    published: p.publicationStatus === 'published', dataOrigin: p.dataOrigin, sourceNote: p.sourceNote, updatedAt: p.updatedAt.toISOString(),
    fullName: ruFirst(p.translations)?.fullName ?? p.slug,
    memorableDates: p._count.memorableDates,
    translations: Object.fromEntries(p.translations.map((t) => [t.locale, { fullName: t.fullName, biography: t.biography ?? '' }])),
  });

  async function savePerson(tx: Tx, id: string | null, input: PersonInput, userId: string, request: Request) {
    const data = {
      slug: input.slug, birthYear: input.birthYear, deathYear: input.deathYear, publicationStatus: status(input.published),
      dataOrigin: input.dataOrigin, sourceNote: input.sourceNote, updatedById: userId,
    };
    const row = id ? await tx.historicalPerson.update({ where: { id }, data }) : await tx.historicalPerson.create({ data: { ...data, createdById: userId } });
    const years = input.birthYear !== null || input.deathYear !== null ? `${input.birthYear ?? '?'}–${input.deathYear ?? ''}` : null;
    await syncTranslations(
      input.translations,
      (locale, t) => tx.historicalPersonTranslation.upsert({
        where: { personId_locale: { personId: row.id, locale } },
        update: { fullName: t.fullName, biography: t.biography, lifeYearsText: years, translationStatus: 'reviewed' },
        create: { personId: row.id, locale, fullName: t.fullName, biography: t.biography, lifeYearsText: years, translationStatus: 'reviewed' },
      }),
      (locale) => tx.historicalPersonTranslation.deleteMany({ where: { personId: row.id, locale } }),
    );
    await writeAudit(tx, request, {
      userId, action: id ? 'update' : 'create', entityType: 'historical_person', entityId: row.id,
      summary: `${id ? 'Изменена' : 'Добавлена'} личность «${input.translations.ru?.fullName ?? input.slug}» (${input.published ? 'опубликована' : 'черновик'})`,
      changes: { published: input.published, languages: Object.keys(input.translations) },
    });
    return tx.historicalPerson.findUniqueOrThrow({ where: { id: row.id }, select: personSelect });
  }

  const personSlugTaken = async (slug: string, except: string | null) => {
    const other = await db.historicalPerson.findUnique({ where: { slug }, select: { id: true } });
    return other !== null && other.id !== except;
  };

  app.get('/admin/memory/persons', async (request) => {
    requirePermission(request, READ);
    const rows = await db.historicalPerson.findMany({ where: { deletedAt: null }, orderBy: { slug: 'asc' }, select: personSelect });
    return { items: rows.map(personOut).sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')) };
  });

  app.get('/admin/memory/persons/:id', async (request) => {
    requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    const row = await db.historicalPerson.findFirst({ where: { id, deletedAt: null }, select: personSelect });
    if (!row) throw notFound();
    return personOut(row);
  });

  app.post('/admin/memory/persons', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const input = personInputSchema.parse(request.body);
    if (await personSlugTaken(input.slug, null)) throw slugConflict();
    return reply.status(201).send(personOut(await db.$transaction((tx) => savePerson(tx, null, input, staff.session.userId, request))));
  });

  app.put('/admin/memory/persons/:id', async (request) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    const current = await db.historicalPerson.findFirst({ where: { id, deletedAt: null }, select: { updatedAt: true } });
    if (!current) throw notFound();
    assertIfMatch(request, current.updatedAt);
    const input = personInputSchema.parse(request.body);
    if (await personSlugTaken(input.slug, id)) throw slugConflict();
    return personOut(await db.$transaction((tx) => savePerson(tx, id, input, staff.session.userId, request)));
  });

  app.delete('/admin/memory/persons/:id', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    const row = await db.historicalPerson.findFirst({ where: { id, deletedAt: null }, select: personSelect });
    if (!row) throw notFound();
    requireConfirm(request);
    await db.$transaction(async (tx) => {
      await tx.historicalPerson.update({ where: { id }, data: { deletedAt: new Date(), updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'historical_person', entityId: id, summary: `Удалена личность «${personOut(row).fullName}»` });
    });
    return reply.status(204).send();
  });

  /* ---------- Коллекции ---------- */
  const collectionSelect = {
    id: true, slug: true, isFeatured: true, sortOrder: true, publicationStatus: true, dataOrigin: true, updatedAt: true,
    translations: { select: { locale: true, title: true, description: true } },
    items: { orderBy: { sortOrder: 'asc' }, select: { itemType: true, itemId: true } },
  } as const;
  type CollectionRow = Prisma.CollectionGetPayload<{ select: typeof collectionSelect }>;

  /**
   * Элементы с подписью для панели и пометкой, видны ли они на сайте. Закрытый или неопубликованный документ
   * можно оставить в коллекции, но сайт его не покажет — панель предупреждает об этом.
   */
  async function describeItems(items: CollectionRow['items']) {
    const docIds = items.filter((i) => i.itemType === 'document').map((i) => i.itemId);
    const personIds = items.filter((i) => i.itemType === 'person').map((i) => i.itemId);
    const [docs, publicDocs, persons] = await Promise.all([
      db.document.findMany({ where: { id: { in: docIds } }, select: { id: true, translations: { select: { locale: true, title: true } } } }),
      db.$queryRaw<Array<{ id: string }>>`SELECT id FROM public_documents_v WHERE id = ANY(${docIds}::uuid[])`,
      db.historicalPerson.findMany({ where: { id: { in: personIds } }, select: { id: true, publicationStatus: true, deletedAt: true, translations: { select: { locale: true, fullName: true } } } }),
    ]);
    const publicSet = new Set(publicDocs.map((d) => d.id));
    return items.map((i) => {
      if (i.itemType === 'document') {
        const d = docs.find((x) => x.id === i.itemId);
        return { type: 'document' as const, id: i.itemId, label: d ? (ruFirst(d.translations)?.title ?? i.itemId) : null, visible: publicSet.has(i.itemId) };
      }
      const p = persons.find((x) => x.id === i.itemId);
      return { type: 'person' as const, id: i.itemId, label: p ? (ruFirst(p.translations)?.fullName ?? i.itemId) : null, visible: !!p && p.publicationStatus === 'published' && p.deletedAt === null };
    });
  }

  const collectionOut = async (c: CollectionRow) => ({
    id: c.id, slug: c.slug, featured: c.isFeatured, sortOrder: c.sortOrder,
    published: c.publicationStatus === 'published', dataOrigin: c.dataOrigin, updatedAt: c.updatedAt.toISOString(),
    title: ruFirst(c.translations)?.title ?? c.slug,
    translations: Object.fromEntries(c.translations.map((t) => [t.locale, { title: t.title, description: t.description ?? '' }])),
    items: await describeItems(c.items),
  });

  /** Все элементы ввода существуют; неизвестный id — 400 с номером элемента. */
  async function checkItems(input: CollectionInput) {
    const docIds = input.items.filter((i) => i.type === 'document').map((i) => i.id);
    const personIds = input.items.filter((i) => i.type === 'person').map((i) => i.id);
    const [docs, persons] = await Promise.all([
      db.document.findMany({ where: { id: { in: docIds }, deletedAt: null }, select: { id: true } }),
      db.historicalPerson.findMany({ where: { id: { in: personIds }, deletedAt: null }, select: { id: true } }),
    ]);
    const known = new Set([...docs, ...persons].map((x) => x.id));
    const bad = input.items.findIndex((i) => !known.has(i.id));
    if (bad >= 0) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown collection item', [{ path: ['items', bad, 'id'], code: 'unknown' }]);
  }

  async function saveCollection(tx: Tx, id: string | null, input: CollectionInput, userId: string, request: Request) {
    const data = {
      slug: input.slug, isFeatured: input.featured, sortOrder: input.sortOrder, publicationStatus: status(input.published),
      dataOrigin: input.dataOrigin, updatedById: userId,
    };
    const row = id ? await tx.collection.update({ where: { id }, data }) : await tx.collection.create({ data: { ...data, createdById: userId } });
    await syncTranslations(
      input.translations,
      (locale, t) => tx.collectionTranslation.upsert({
        where: { collectionId_locale: { collectionId: row.id, locale } },
        update: { title: t.title, description: t.description, translationStatus: 'reviewed' },
        create: { collectionId: row.id, locale, title: t.title, description: t.description, translationStatus: 'reviewed' },
      }),
      (locale) => tx.collectionTranslation.deleteMany({ where: { collectionId: row.id, locale } }),
    );
    await tx.collectionItem.deleteMany({ where: { collectionId: row.id } });
    await tx.collectionItem.createMany({ data: input.items.map((i, sortOrder) => ({ collectionId: row.id, itemType: i.type, itemId: i.id, sortOrder })) });
    await writeAudit(tx, request, {
      userId, action: id ? 'update' : 'create', entityType: 'collection', entityId: row.id,
      summary: `${id ? 'Изменена' : 'Создана'} коллекция «${input.translations.ru?.title ?? input.slug}» (${input.items.length} эл., ${input.published ? 'опубликована' : 'черновик'})`,
      changes: { published: input.published, items: input.items.length, languages: Object.keys(input.translations) },
    });
    return tx.collection.findUniqueOrThrow({ where: { id: row.id }, select: collectionSelect });
  }

  const collectionSlugTaken = async (slug: string, except: string | null) => {
    const other = await db.collection.findUnique({ where: { slug }, select: { id: true } });
    return other !== null && other.id !== except;
  };

  app.get('/admin/memory/collections', async (request) => {
    requirePermission(request, READ);
    const rows = await db.collection.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }], select: collectionSelect });
    return { items: await Promise.all(rows.map(collectionOut)) };
  });

  app.get('/admin/memory/collections/:id', async (request) => {
    requirePermission(request, READ);
    const { id } = ids.parse(request.params);
    const row = await db.collection.findFirst({ where: { id, deletedAt: null }, select: collectionSelect });
    if (!row) throw notFound();
    return collectionOut(row);
  });

  app.post('/admin/memory/collections', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const input = collectionInputSchema.parse(request.body);
    await checkItems(input);
    if (await collectionSlugTaken(input.slug, null)) throw slugConflict();
    const row = await db.$transaction((tx) => saveCollection(tx, null, input, staff.session.userId, request));
    return reply.status(201).send(await collectionOut(row));
  });

  app.put('/admin/memory/collections/:id', async (request) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    const current = await db.collection.findFirst({ where: { id, deletedAt: null }, select: { updatedAt: true } });
    if (!current) throw notFound();
    assertIfMatch(request, current.updatedAt);
    const input = collectionInputSchema.parse(request.body);
    await checkItems(input);
    if (await collectionSlugTaken(input.slug, id)) throw slugConflict();
    return collectionOut(await db.$transaction((tx) => saveCollection(tx, id, input, staff.session.userId, request)));
  });

  app.delete('/admin/memory/collections/:id', async (request, reply) => {
    const staff = requirePermission(request, WRITE);
    const { id } = ids.parse(request.params);
    const row = await db.collection.findFirst({ where: { id, deletedAt: null }, select: collectionSelect });
    if (!row) throw notFound();
    requireConfirm(request);
    await db.$transaction(async (tx) => {
      await tx.collection.update({ where: { id }, data: { deletedAt: new Date(), updatedById: staff.session.userId } });
      await writeAudit(tx, request, { userId: staff.session.userId, action: 'delete', entityType: 'collection', entityId: id, summary: `Удалена коллекция «${ruFirst(row.translations)?.title ?? row.slug}»` });
    });
    return reply.status(204).send();
  });
}
