import type { Prisma } from '@prisma/client';
import type { Staff } from '../../http/staff.ts';
import { LOCALES, WORKFLOW_ACTIONS, type WorkflowAction } from '@archive-vko/shared';

/** Общие части административного API: каталог и выставки. */

/** Перевод для панели: русский, а если его нет — первый имеющийся. Панель ведётся на русском. */
/** Перевод на каждый язык: есть во вводе — upsert, нет — удаление. */
export async function syncTranslations<T>(
  locales: Partial<Record<(typeof LOCALES)[number], T>>,
  upsert: (locale: (typeof LOCALES)[number], value: T) => Promise<unknown>,
  remove: (locale: (typeof LOCALES)[number]) => Promise<unknown>,
) {
  for (const locale of LOCALES) {
    const value = locales[locale];
    await (value ? upsert(locale, value) : remove(locale));
  }
}

export const ruFirst = <T extends { locale: string }>(list: readonly T[]): T | undefined => list.find((t) => t.locale === 'ru') ?? list[0];

/** Права, дающие доступ к каталогу в панели. */
export const CATALOG_READ = ['catalog:edit', 'catalog:submit', 'catalog:review', 'catalog:publish'] as const;

/** Филиалы, каталог которых видит сотрудник; null — все филиалы (право глобальное). */
export function catalogBranchScope(staff: Staff): string[] | null {
  if (CATALOG_READ.some((p) => staff.grants.global.has(p))) return null;
  return [...new Set(CATALOG_READ.flatMap((p) => [...(staff.grants.byBranch.get(p) ?? [])]))];
}

/** Действие согласования в адресе пишется через дефис: /request-changes. */
export const actionFromPath = (segment: string): WorkflowAction | null => {
  const action = segment.replace(/-/g, '_');
  return WORKFLOW_ACTIONS.find((a) => a === action) ?? null;
};

export const STATUS_RU: Record<string, string> = {
  draft: 'черновик',
  in_review: 'на проверке',
  needs_changes: 'требует доработки',
  approved: 'одобрено',
  published: 'опубликовано',
  archived: 'архивировано',
};

/** Загружаемые сканы: только растровые форматы, тип определяется по сигнатуре файла, а не по имени (S-013). */
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const UPLOAD_LIMIT = 20 * 1024 * 1024;
export const MASTER_BUCKET = 'archive-masters';

export function sniffImage(data: Buffer): (typeof UPLOAD_TYPES)[number] | null {
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length > 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length > 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Уведомления внутри админки (ТЗ §6.7): об отправке на проверку — ролям с правом проверки,
 * о возврате на доработку, одобрении и публикации — автору записи.
 */
export async function notifyWorkflow(
  tx: Prisma.TransactionClient,
  resource: 'catalog' | 'exhibitions',
  e: { entity: string; id: string; action: WorkflowAction; to: string; label: string; comment: string | null; actorId: string; authorId: string | null },
): Promise<void> {
  const base = { type: e.action, entityType: e.entity, entityId: e.id };
  if (e.action === 'submit') {
    const roles = await tx.role.findMany({ where: { permissions: { some: { permission: { code: `${resource}:review` } } } }, select: { id: true } });
    await tx.notification.createMany({ data: roles.map((r) => ({ ...base, roleId: r.id, message: `На проверку: «${e.label}»` })) });
    return;
  }
  if (e.action === 'approve') {
    const roles = await tx.role.findMany({ where: { permissions: { some: { permission: { code: `${resource}:publish` } } } }, select: { id: true } });
    await tx.notification.createMany({ data: roles.map((r) => ({ ...base, roleId: r.id, message: `Одобрено и ждёт публикации: «${e.label}»` })) });
  }
  if (e.authorId && e.authorId !== e.actorId) {
    const text = {
      request_changes: `Возвращено на доработку: «${e.label}». ${e.comment ?? ''}`.trim(),
      approve: `Одобрено: «${e.label}»`,
      publish: `Опубликовано: «${e.label}»`,
      archive: `Снято с публикации: «${e.label}»`,
      restore: `Снова опубликовано: «${e.label}»`,
      submit: '',
    }[e.action];
    if (text) await tx.notification.create({ data: { ...base, userId: e.authorId, message: text } });
  }
}