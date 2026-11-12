import type { DateRange } from './types.ts';

const INTL_LOCALE: Record<string, string> = { kk: 'kk-KZ', ru: 'ru-RU', en: 'en-GB' };

/** Дата публикации: «8 ноября 2026 г.» в языке интерфейса. */
export function formatDate(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[lang] ?? 'ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Almaty' }).format(
    new Date(iso),
  );
}

/** Датировка документа годами: «1956» или «1956–1960»; точнее года на карточках не показываем. */
export function formatYears(date: DateRange): string | null {
  const from = date.from?.slice(0, 4) ?? null;
  const to = date.to?.slice(0, 4) ?? null;
  if (!from && !to) return null;
  if (!from || !to || from === to) return from ?? to;
  return `${from}–${to}`;
}
