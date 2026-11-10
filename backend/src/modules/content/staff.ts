import type { PrismaClient } from '@prisma/client';
import type { Locale } from '@archive-vko/shared';

/** Публичные контакты сотрудников (ТЗ §5.2: структура архива): только опубликованные и не удалённые. */
export async function publicStaff(db: PrismaClient, branchId: string, lang: Locale) {
  const rows = await db.staffContact.findMany({
    where: { branchId, publicationStatus: 'published', deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    include: { translations: { where: { translationStatus: { not: 'missing' } } } },
  });
  return rows.flatMap((s) => {
    const t = s.translations.find((x) => x.locale === lang) ?? s.translations.find((x) => x.locale === 'ru') ?? s.translations[0];
    if (!t) return [];
    return [{
      id: s.id,
      fullName: t.fullName,
      position: t.position,
      department: t.department,
      phone: s.phone,
      email: s.email,
      contentLang: t.locale,
      translationStatus: t.translationStatus,
    }];
  });
}
