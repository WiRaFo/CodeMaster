import { DEFAULT_LOCALE, type Locale } from '@archive-vko/shared';
import { isLocale } from '../i18n/index.ts';
import { readStorage } from '../lib/storage.ts';

export const LANG_STORAGE_KEY = 'archive-vko:lang';

/** Язык для адреса без префикса: последний выбранный, затем язык браузера, иначе казахский. */
export function preferredLocale(): Locale {
  const saved = readStorage(LANG_STORAGE_KEY) ?? undefined;
  if (isLocale(saved)) return saved;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = tag.slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}
