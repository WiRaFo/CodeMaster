import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { branchListSchema, langOnlySchema, type Locale } from '@archive-vko/shared';
import { notFound } from '../../http/errors.ts';
import { resolveLang } from '../../http/lang.ts';
import { and, bestTranslation, likePattern } from '../../infrastructure/database/sql.ts';
import { publicStaff } from '../content/staff.ts';

/**
 * Публичный реестр подразделений (ТЗ §5.5, с. 7–8). Только опубликованные и не удалённые записи.
 * Координаты отдаются, только если они заполнены и разрешено показывать подразделение на карте.
 * needsVerification = сведения перенесены и не сверены архивом (verified_at пуст).
 */

interface BranchRow {
  id: string;
  slug: string;
  parent_branch_id: string | null;
  is_main: boolean;
  type_code: string;
  type_name: string | null;
  settlement_slug: string | null;
  settlement_name: string | null;
  postal_code: string | null;
  lat: Prisma.Decimal | null;
  lng: Prisma.Decimal | null;
  show_on_map: boolean;
  phone: string | null;
  email: string | null;
  website: string | null;
  verified_at: Date | null;
  source_url: string | null;
  data_origin: string;
  full_name: string | null;
  short_name: string | null;
  address: string | null;
  schedule_text: string | null;
  reading_room_schedule: string | null;
  description: string | null;
  main_directions: string | null;
  competence: string | null;
  service_area: string | null;
  accessibility_info: string | null;
  content_lang: string | null;
  translation_status: string | null;
}

const PUBLIC_BRANCH = Prisma.sql`b.publication_status = 'published' AND b.deleted_at IS NULL`;

function branchSelect(lang: Locale): Prisma.Sql {
  return Prisma.sql`
    SELECT b.id, b.slug, b.parent_branch_id, b.is_main, bty.code AS type_code, btt.name AS type_name,
           s.slug AS settlement_slug, st.name AS settlement_name, b.postal_code, b.lat, b.lng, b.show_on_map,
           b.phone, b.email, b.website, b.verified_at, b.source_url, b.data_origin::text AS data_origin,
           t.full_name, t.short_name, t.address, t.schedule_text, t.reading_room_schedule, t.description,
           t.main_directions, t.competence, t.service_area, t.accessibility_info,
           t.locale AS content_lang, t.translation_status
    FROM branches b
    JOIN branch_types bty ON bty.id = b.branch_type_id
    ${bestTranslation('branchType', 'btt', 'b.branch_type_id', lang, ['name'])}
    LEFT JOIN settlements s ON s.id = b.settlement_id
    ${bestTranslation('settlement', 'st', 'b.settlement_id', lang, ['name'])}
    ${bestTranslation('branch', 't', 'b.id', lang, [
      'full_name', 'short_name', 'address', 'schedule_text', 'reading_room_schedule', 'description',
      'main_directions', 'competence', 'service_area', 'accessibility_info',
    ])}`;
}

function summaryDto(b: BranchRow) {
  const onMap = b.show_on_map && b.lat !== null && b.lng !== null;
  return {
    id: b.id,
    slug: b.slug,
    parentId: b.parent_branch_id,
    isMain: b.is_main,
    type: { code: b.type_code, name: b.type_name },
    name: b.full_name,
    shortName: b.short_name,
    address: b.address,
    settlement: b.settlement_slug ? { slug: b.settlement_slug, name: b.settlement_name } : null,
    phone: b.phone,
    email: b.email,
    coordinates: onMap ? { lat: Number(b.lat), lng: Number(b.lng) } : null,
    needsVerification: b.verified_at === null,
    dataOrigin: b.data_origin,
    contentLang: b.content_lang,
    translationStatus: b.translation_status,
  };
}

export async function branchRoutes(app: FastifyInstance, opts: { db: PrismaClient }): Promise<void> {
  const { db } = opts;

  app.get('/branches', async (request, reply) => {
    const query = branchListSchema.parse(request.query);
    const lang = resolveLang(request, reply, query.lang);
    const conds: Prisma.Sql[] = [PUBLIC_BRANCH];
    if (query.type) conds.push(Prisma.sql`bty.code = ANY(${query.type})`);
    if (query.settlement) conds.push(Prisma.sql`s.slug = ANY(${query.settlement})`);
    if (query.q) {
      const pattern = likePattern(query.q);
      conds.push(Prisma.sql`(EXISTS (SELECT 1 FROM branch_translations x WHERE x.branch_id = b.id
                                AND (x.full_name ILIKE ${pattern} ESCAPE '\\' OR x.short_name ILIKE ${pattern} ESCAPE '\\'
                                     OR x.address ILIKE ${pattern} ESCAPE '\\'))
                            OR EXISTS (SELECT 1 FROM settlement_translations x WHERE x.settlement_id = b.settlement_id
                                AND x.name ILIKE ${pattern} ESCAPE '\\')
                            OR EXISTS (SELECT 1 FROM settlement_names x WHERE x.settlement_id = b.settlement_id
                                AND x.name ILIKE ${pattern} ESCAPE '\\'))`);
    }
    const rows = await db.$queryRaw<BranchRow[]>`${branchSelect(lang)} ${and(conds)} ORDER BY b.sort_order, b.slug`;
    return { items: rows.map(summaryDto) };
  });

  app.get('/branches/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string().max(100) }).parse(request.params);
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const [b] = await db.$queryRaw<BranchRow[]>`${branchSelect(lang)} WHERE ${PUBLIC_BRANCH} AND b.slug = ${slug}`;
    if (!b) throw notFound();
    const [schedules, sites, fonds, staff] = await Promise.all([
      db.branchSchedule.findMany({
        where: { branchId: b.id },
        orderBy: [{ kind: 'asc' }, { weekday: 'asc' }],
        select: { kind: true, weekday: true, opens: true, closes: true, note: true },
      }),
      db.$queryRaw<BranchRow[]>`${branchSelect(lang)} WHERE ${PUBLIC_BRANCH} AND b.parent_branch_id = ${b.id}::uuid ORDER BY b.sort_order`,
      db.$queryRaw<Array<{ id: string; fond_number: string; title: string | null }>>`
        SELECT f.id, f.fond_number, t.title FROM public_fonds_v f
        ${bestTranslation('fond', 't', 'f.id', lang, ['title'])}
        WHERE f.branch_id = ${b.id}::uuid AND f.is_highlighted
        ORDER BY f.fond_number_sort NULLS LAST, f.fond_number`,
      publicStaff(db, b.id, lang),
    ]);
    const hours = (kind: string) =>
      schedules.filter((s) => s.kind === kind).map(({ weekday, opens, closes, note }) => ({ weekday, opens, closes, note }));
    return {
      ...summaryDto(b),
      postalCode: b.postal_code,
      website: b.website,
      scheduleText: b.schedule_text,
      readingRoomSchedule: b.reading_room_schedule,
      schedule: { office: hours('office'), readingRoom: hours('reading_room') },
      description: b.description,
      mainDirections: b.main_directions,
      competence: b.competence,
      serviceArea: b.service_area,
      accessibilityInfo: b.accessibility_info,
      sourceUrl: b.source_url,
      verifiedAt: b.verified_at ? b.verified_at.toISOString().slice(0, 10) : null,
      sites: sites.map(summaryDto),
      highlightedFonds: fonds.map((f) => ({ id: f.id, number: f.fond_number, title: f.title })),
      staff,
    };
  });

  app.get('/branch-types', async (request, reply) => {
    const lang = resolveLang(request, reply, langOnlySchema.parse(request.query).lang);
    const rows = await db.$queryRaw<Array<{ code: string; name: string | null }>>`
      SELECT bty.code, n.name FROM branch_types bty
      ${bestTranslation('branchType', 'n', 'bty.id', lang, ['name'])}
      ORDER BY bty.sort_order`;
    return { items: rows };
  });
}
