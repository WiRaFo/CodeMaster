import { z } from 'zod';

/** Переменные окружения backend. Ошибка конфигурации останавливает запуск с перечнем полей. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /** Папка файлового хранилища (сканы и производные). В production — MinIO, см. docs/architecture.md. */
  STORAGE_DIR: z.string().min(1).default('storage'),
  /** Дополнительные источники, с которых разрешены изменяющие запросы к /auth и /admin (через запятую). */
  ADMIN_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Неверная конфигурация окружения: ${fields}`);
  }
  return parsed.data;
}
