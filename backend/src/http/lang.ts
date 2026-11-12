import type { FastifyReply, FastifyRequest } from 'fastify';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@archive-vko/shared';

const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

/**
 * Язык контента: параметр `lang` важнее `Accept-Language`; по умолчанию казахский (государственный язык).
 * Выбранный язык возвращается в заголовке Content-Language.
 */
export function resolveLang(request: FastifyRequest, reply: FastifyReply, explicit: Locale | undefined): Locale {
  let lang: Locale = explicit ?? DEFAULT_LOCALE;
  if (!explicit) {
    const header = request.headers['accept-language'];
    if (typeof header === 'string') {
      const preferred = header
        .split(',')
        .map((part) => {
          const [tag = '', q] = part.trim().split(';q=');
          return { code: tag.slice(0, 2).toLowerCase(), q: q === undefined ? 1 : Number(q) };
        })
        .filter((p) => isLocale(p.code) && p.q > 0)
        .sort((a, b) => b.q - a.q)[0];
      if (preferred && isLocale(preferred.code)) lang = preferred.code;
    }
  }
  reply.header('Content-Language', lang);
  return lang;
}
