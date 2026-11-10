import type { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

/** Учётная запись главного администратора из переменных окружения. Пароль хранится только как хеш argon2id. */
export async function seedAdmin(db: PrismaClient, email: string, password: string): Promise<void> {
  if (password.length < 12) throw new Error('SEED_ADMIN_PASSWORD должен быть не короче 12 символов');
  const role = await db.role.findUnique({ where: { code: 'super_admin' } });
  if (!role) throw new Error('Нет роли super_admin; сначала запустите справочники');
  const existing = await db.user.findUnique({ where: { email } });
  const user =
    existing ??
    (await db.user.create({
      data: { email, fullName: 'Главный администратор', passwordHash: await argon2.hash(password, { type: argon2.argon2id }) },
    }));
  const assigned = await db.userRole.findFirst({ where: { userId: user.id, roleId: role.id, branchId: null } });
  if (!assigned) await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
}

/**
 * Демонстрационные сотрудники для показа цикла согласования двумя ролями (только development, набор demo).
 * Пароль берётся из SEED_DEMO_STAFF_PASSWORD и в репозиторий не попадает.
 */
export const DEMO_STAFF = [
  { email: 'archivist@archive.local', fullName: '[Демо] Сотрудник архива', role: 'archivist' },
  { email: 'moderator@archive.local', fullName: '[Демо] Модератор', role: 'moderator' },
  { email: 'editor@archive.local', fullName: '[Демо] Редактор сайта', role: 'site_admin' },
  // Администратор одного филиала: права действуют только в пределах филиала Риддер.
  { email: 'ridder@archive.local', fullName: '[Демо] Администратор филиала Риддер', role: 'branch_admin', branchSlug: 'ridder' },
] as const satisfies ReadonlyArray<{ email: string; fullName: string; role: string; branchSlug?: string }>;

export async function seedDemoStaff(db: PrismaClient, password: string): Promise<void> {
  if (password.length < 12) throw new Error('SEED_DEMO_STAFF_PASSWORD должен быть не короче 12 символов');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  for (const s of DEMO_STAFF) {
    const role = await db.role.findUniqueOrThrow({ where: { code: s.role } });
    const user = await db.user.upsert({ where: { email: s.email }, create: { email: s.email, fullName: s.fullName, passwordHash: hash }, update: {} });
    const branchId = 'branchSlug' in s ? (await db.branch.findUniqueOrThrow({ where: { slug: s.branchSlug }, select: { id: true } })).id : null;
    const assigned = await db.userRole.findFirst({ where: { userId: user.id, roleId: role.id, branchId } });
    if (!assigned) await db.userRole.create({ data: { userId: user.id, roleId: role.id, branchId } });
  }
}
