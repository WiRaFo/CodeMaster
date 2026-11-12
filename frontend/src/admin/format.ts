/** Общие для панели языки контента и форматы дат. Время всегда по Алматы, как в архиве, а не по часам браузера. */

export type AdminLocale = 'ru' | 'kk' | 'en';

export const ADMIN_LOCALES: ReadonlyArray<{ code: AdminLocale; label: string }> = [
  { code: 'ru', label: 'Русский' },
  { code: 'kk', label: 'Казахский' },
  { code: 'en', label: 'Английский' },
];

const TIME_ZONE = 'Asia/Almaty';

export const formatDateTime = (iso: string): string => new Date(iso).toLocaleString('ru-RU', { timeZone: TIME_ZONE });
export const formatDay = (iso: string): string => new Date(iso).toLocaleDateString('ru-RU', { timeZone: TIME_ZONE });
