import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LOCALES, type Locale } from '@archive-vko/shared';
import { assertSameOrigin } from '../../http/staff.ts';

/**
 * Аналитика качества сайта без персональных данных (ТЗ §5.8 Д, с. 11; F-126, F-127, S-032).
 * Хранятся только счётчики по дням: раздел и язык просмотра, вид и адрес ошибки, текст запроса
 * с замаскированными почтой и длинными числами. Ни IP, ни cookies, ни идентификаторов посетителя.
 * Если браузер просит не отслеживать (DNT или Sec-GPC), ничего не записывается.
 */

/** Разделы публичного сайта, которые считаются отдельно; остальное — «other». */
export const ANALYTICS_SECTIONS = [
  'home', 'catalog', 'catalog/documents', 'catalog/fonds', 'catalog/inventories', 'catalog/cases',
  'news', 'history', 'history/timeline', 'history/persons', 'history/collections', 'history/gallery',
  'exhibitions', 'branches', 'assistant', 'faq', 'visitors', 'about', 'calendar', 'anticorruption',
  'services', 'legislation', 'reading-room', 'symbols', 'links', 'feedback', 'accessibility', 'search', 'other',
] as const;
const KNOWN = new Set<string>(ANALYTICS_SECTIONS);

/** Раздел и язык по адресу страницы: «/ru/catalog/documents/…» → catalog/documents, ru. */
export function sectionOf(path: string): { section: string; locale: Locale } | null {
  const parts = path.split(/[?#]/)[0]!.split('/').filter(Boolean);
  const locale = LOCALES.find((l) => l === parts[0]);
  if (!locale) return null;
  if (parts.length === 1) return { section: 'home', locale };
  const two = `${parts[1]}/${parts[2] ?? ''}`;
  if (KNOWN.has(two)) return { section: two, locale };
  return { section: KNOWN.has(parts[1]!) ? parts[1]! : 'other', locale };
}

/** Почта и длинные числа (телефоны, ИИН) заменяются, чтобы в журнал запросов не попали персональные данные. */
export function maskQuery(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s()-]{6,}\d/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const doNotTrack = (request: FastifyRequest) => request.headers.dnt === '1' || request.headers['sec-gpc'] === '1';
const today = () => new Date(new Date().toISOString().slice(0, 10));

/** Запись запроса поиска или помощника; сбой записи не мешает ответу. */
export async function logSearchQuery(
  db: PrismaClient | undefined,
  request: FastifyRequest,
  entry: { text: string; locale: Locale; source: 'catalog' | 'site' | 'assistant'; resultCount: number; filters?: Record<string, string | number | boolean | null> },
): Promise<void> {
  if (!db || doNotTrack(request)) return;
  const queryText = maskQuery(entry.text);
  if (!queryText) return;
  try {
    await db.searchQuery.create({ data: { queryText, locale: entry.locale, source: entry.source, resultCount: entry.resultCount, ...(entry.filters ? { filters: entry.filters } : {}) } });
  } catch (error) {
    request.log.warn({ error: String(error) }, 'analytics: query not logged');
  }
}

const viewSchema = z.object({ path: z.string().min(1).max(500) });
const errorSchema = z.object({ kind: z.enum(['not_found', 'load_failed']), path: z.string().min(1).max(500) });

export async function analyticsRoutes(app: FastifyInstance, { db, allowedOrigins }: { db: PrismaClient; allowedOrigins: readonly string[] }): Promise<void> {
  app.post('/analytics/view', async (request, reply) => {
    assertSameOrigin(request, allowedOrigins);
    const { path } = viewSchema.parse(request.body);
    const where = sectionOf(path);
    if (where && !doNotTrack(request)) {
      const day = today();
      await db.analyticsPageView.upsert({
        where: { day_section_locale: { day, ...where } },
        update: { views: { increment: 1 } },
        create: { day, ...where, views: 1 },
      });
    }
    return reply.code(204).header('Cache-Control', 'no-store').send();
  });

  app.post('/analytics/error', async (request, reply) => {
    assertSameOrigin(request, allowedOrigins);
    const input = errorSchema.parse(request.body);
    // Адрес без параметров и с замаскированными числами: в журнал не попадут поисковые фразы и номера.
    const path = maskQuery(input.path.split(/[?#]/)[0]!).slice(0, 200);
    if (!doNotTrack(request)) {
      const day = today();
      await db.analyticsError.upsert({
        where: { day_kind_path: { day, kind: input.kind, path } },
        update: { count: { increment: 1 } },
        create: { day, kind: input.kind, path, count: 1 },
      });
    }
    return reply.code(204).header('Cache-Control', 'no-store').send();
  });
}
