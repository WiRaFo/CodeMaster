import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@archive-vko/shared/enums';
import kk from './locales/kk.json';
import ru from './locales/ru.json';
import en from './locales/en.json';

/**
 * Переводы интерфейса (не контента): словари в src/i18n/locales.
 * Казахский и английский тексты подготовлены командой и требуют вычитки носителем (ТЗ §5.10).
 */
export const resources = { kk: { translation: kk }, ru: { translation: ru }, en: { translation: en } } as const;

export const isLocale = (value: string | undefined): value is Locale =>
  value !== undefined && (LOCALES as readonly string[]).includes(value);

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

export default i18n;
