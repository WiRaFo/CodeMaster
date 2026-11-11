import type { Locale, TranslationStatus } from '@prisma/client';

/** Тексты одной записи на трёх языках. */
export type Tri<T> = Readonly<Record<Locale, T>>;

/**
 * Строки переводов для createMany. Русский текст взят из источника (или написан командой) и помечен reviewed;
 * kk и en подготовлены командой без проверки носителем, поэтому machine (ТЗ §5.10 — нужна проверка перед публикацией).
 */
export function translationRows<T extends object>(texts: Tri<T>): Array<T & { locale: Locale; translationStatus: TranslationStatus }> {
  return (['ru', 'kk', 'en'] as const).map((locale) => ({
    ...texts[locale],
    locale,
    translationStatus: locale === 'ru' ? 'reviewed' : 'machine',
  }));
}

/** Короткая запись для справочников, у которых переводимо только имя. */
export function names(ru: string, kk: string, en: string): Tri<{ name: string }> {
  return { ru: { name: ru }, kk: { name: kk }, en: { name: en } };
}


/** Источник для записей, перенесённых с текущего сайта (аудит, docs/requirements-matrix.md Q-22, Q-23). */
export const OLD_SITE_URL = 'http://e-arhiv.vko.gov.kz/ru';
export const OLD_SITE_CONTACTS_URL = 'http://e-arhiv.vko.gov.kz/ru/Page/Index/1330';
