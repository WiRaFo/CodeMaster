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
  /**
   * Доверие X-Forwarded-For/Host: false (по умолчанию), true или адреса прокси через запятую
   * (например loopback или 10.0.0.0/8). Без своего обратного прокси оставлять false.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v): boolean | string => {
      const value = v.trim();
      if (value === '' || value === 'false') return false;
      if (value === 'true') return true;
      return value;
    }),
  /**
   * Модель смыслового поиска (D-023). none — только обычный поиск. ollama — локальный сервер Ollama:
   * модель работает на сервере архива, тексты наружу не уходят (ТЗ §5.8, P-005, S-031).
   */
  AI_PROVIDER: z.enum(['none', 'ollama']).default('none'),
  AI_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  /** Многоязычная модель эмбеддингов: казахский, русский, английский. */
  AI_EMBED_MODEL: z.string().min(1).default('bge-m3'),
  /** Сколько ждать модель при поиске; дольше — посетитель получает обычную выдачу без смысловой части. */
  AI_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(4000),
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
