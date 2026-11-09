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
