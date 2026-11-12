import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LOCALES, type Locale } from '@archive-vko/shared';
import { ApiError, notFound } from '../../http/errors.ts';
import { staffOf, type Staff } from '../../http/staff.ts';
import { hasGrant } from '../auth/session.ts';
import { writeAudit } from '../audit/audit.ts';

/**
 * Филиалы в панели управления (ТЗ §6.4; F-147; дополнение к ТЗ §6 «Работа администратора филиала»).
 * Право branches:edit: глобальное — все подразделения, у администратора филиала — только свой (user_roles.branch_id).
 * Чужой филиал отвечает тем же 404, что и несуществующий: администратор не узнаёт о чужих записях больше, чем видно на сайте.
 * Правка — сразу на сайте, с записью в журнал; дата сверки ставится по дню правки (сведения вносит сотрудник архива).
 */

const optionalText = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable();

const translationSchema = z.object({
  fullName: z.string().trim().min(3).max(300),
  shortName: optionalText(120),
  address: optionalText(300),
  scheduleText: optionalText(300),
  readingRoomSchedule: optionalText(300),
});

/** Границы Казахстана с запасом: координаты вне страны — почти наверняка перепутанные широта и долгота. */
export const branchInputSchema = z
  .object({
    phone: optionalText(60),
    email: z.string().trim().max(120).transform((v) => (v === '' ? null : v)).pipe(z.email().nullable()).nullable(),
    website: z.string().trim().max(300).transform((v) => (v === '' ? null : v)).pipe(z.url().startsWith('https://').nullable()).nullable(),
    postalCode: z.string().trim().transform((v) => (v === '' ? null : v)).pipe(z.string().regex(/^\d{6}$/).nullable()).nullable(),
    lat: z.number().min(40).max(56).nullable(),
    lng: z.number().min(46).max(88).nullable(),
    showOnMap: z.boolean(),
    translations: z.partialRecord(z.enum(LOCALES), translationSchema),
  })
  .refine((v) => (v.lat === null) === (v.lng === null), { path: ['lng'], message: 'Укажите обе координаты или ни одной' })
  .refine((v) => v.translations.ru !== undefined, { path: ['translations', 'ru'], message: 'Русское название обязательно' });

export type BranchInput = z.infer<typeof branchInputSchema>;

const canEditBranch = (staff: Staff, branchId: string) => hasGrant(staff.grants, 'branches:edit', branchId);
const canEditAny = (staff: Staff) => staff.grants.global.has('branches:edit') || staff.grants.byBranch.has('branches:edit');

export async function branchAdminRoutes(app: FastifyInstance, { db }: { db: PrismaClient }): Promise<void> {
  const requireAny = (request: FastifyRequest) => {
    const staff = staffOf(request);
    if (!canEditAny(staff)) throw new ApiError(403, 'FORBIDDEN', 'Permission branches:edit required');
    return staff;
  };

  app.get('/admin/branches', async (request) => {
    const staff = requireAny(request);
    const rows = await db.branch.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, phone: true, verifiedAt: true, lat: true, publicationStatus: true, translations: { where: { locale: 'ru' }, select: { fullName: true, shortName: true } } },
    });
    return {
      items: rows.filter((b) => canEditBranch(staff, b.id)).map((b) => ({
        id: b.id,
        slug: b.slug,
        name: b.translations[0]?.shortName ?? b.translations[0]?.fullName ?? b.slug,
        phone: b.phone,
        hasCoordinates: b.lat !== null,
        verifiedAt: b.verifiedAt?.toISOString().slice(0, 10) ?? null,
        status: b.publicationStatus,
      })),
    };
  });

  app.get('/admin/branches/:id', async (request) => {
    const staff = requireAny(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    if (!canEditBranch(staff, id)) throw notFound();
    const b = await db.branch.findFirst({ where: { id, deletedAt: null }, include: { translations: true } });
    if (!b) throw notFound();
    return {
      id: b.id,
      slug: b.slug,
      phone: b.phone,
      email: b.email,
      website: b.website,
      postalCode: b.postalCode,
      lat: b.lat === null ? null : Number(b.lat),
      lng: b.lng === null ? null : Number(b.lng),
      showOnMap: b.showOnMap,
      verifiedAt: b.verifiedAt?.toISOString().slice(0, 10) ?? null,
      updatedAt: b.updatedAt.toISOString(),
      translations: Object.fromEntries(b.translations.map((t) => [t.locale, {
        fullName: t.fullName, shortName: t.shortName, address: t.address, scheduleText: t.scheduleText,
        readingRoomSchedule: t.readingRoomSchedule, translationStatus: t.translationStatus,
      }])),
    };
  });

  app.patch('/admin/branches/:id', async (request) => {
    const staff = requireAny(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    if (!canEditBranch(staff, id)) throw notFound();
    const before = await db.branch.findFirst({ where: { id, deletedAt: null }, include: { translations: true } });
    if (!before) throw notFound();
    const ifMatch = request.headers['if-match'];
    if (typeof ifMatch === 'string' && ifMatch !== before.updatedAt.toISOString()) {
      throw new ApiError(409, 'CONFLICT', 'The record was changed by someone else; reload it');
    }
    const input = branchInputSchema.parse(request.body);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const fields = ['phone', 'email', 'website', 'postalCode', 'lat', 'lng', 'showOnMap'] as const;
    const beforeValues = {
      phone: before.phone, email: before.email, website: before.website, postalCode: before.postalCode,
      lat: before.lat === null ? null : Number(before.lat), lng: before.lng === null ? null : Number(before.lng), showOnMap: before.showOnMap,
    };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of fields) if (beforeValues[f] !== input[f]) changes[f] = { from: beforeValues[f], to: input[f] };

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.branch.update({
        where: { id },
        data: {
          phone: input.phone, email: input.email, website: input.website, postalCode: input.postalCode,
          lat: input.lat, lng: input.lng, showOnMap: input.showOnMap,
          verifiedAt: today, dataOrigin: 'verified', updatedById: staff.session.userId,
        },
      });
      for (const locale of LOCALES) {
        const t = input.translations[locale];
        if (!t) continue;
        const prev = before.translations.find((x) => x.locale === locale);
        for (const [k, v] of Object.entries(t)) {
          const old = prev ? prev[k as keyof typeof t] : null;
          if (old !== v) changes[`${locale}.${k}`] = { from: old ?? null, to: v };
        }
        const data = { ...t, translationStatus: 'reviewed' as const };
        await tx.branchTranslation.upsert({ where: { branchId_locale: { branchId: id, locale: locale as Locale } }, update: data, create: { ...data, branchId: id, locale } });
      }
      const name = input.translations.ru?.shortName ?? input.translations.ru?.fullName ?? before.slug;
      await writeAudit(tx, request, {
        userId: staff.session.userId, action: 'update', entityType: 'branch', entityId: id,
        summary: `Филиал «${name}»: изменено полей — ${Object.keys(changes).length}`,
        changes: JSON.parse(JSON.stringify(changes)) as Record<string, { from: string | number | boolean | null; to: string | number | boolean | null }>,
      });
      return row;
    });
    return { id, updatedAt: updated.updatedAt.toISOString(), changed: Object.keys(changes) };
  });
}
