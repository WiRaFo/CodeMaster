/**
 * Восстановление входа на стенде разработки: ставит пароли из .env (SEED_ADMIN_PASSWORD главному администратору,
 * SEED_DEMO_STAFF_PASSWORD демо-сотрудникам) и снимает временную блокировку после неудачных попыток.
 * Нужно, если .env поменяли после первого сида: сид существующих пользователей не трогает.
 * В production не запускается.
 */
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { DEMO_STAFF } from './admin.ts';

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') throw new Error('Сброс паролей на production запрещён');
  const db = new PrismaClient();
  try {
    const set = async (email: string | undefined, password: string | undefined) => {
      if (!email || !password) return;
      if (password.length < 12) throw new Error(`Пароль для ${email} короче 12 символов`);
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const r = await db.user.updateMany({ where: { email }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
      console.log(`${email}: ${r.count ? 'пароль из .env установлен' : 'пользователя нет — запустите npm run db:seed'}`);
    };
    await set(process.env['SEED_ADMIN_EMAIL'], process.env['SEED_ADMIN_PASSWORD']);
    for (const s of DEMO_STAFF) await set(s.email, process.env['SEED_DEMO_STAFF_PASSWORD']);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
