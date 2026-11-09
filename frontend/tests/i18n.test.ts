import { describe, expect, it } from 'vitest';
import kk from '../src/i18n/locales/kk.json';
import ru from '../src/i18n/locales/ru.json';
import en from '../src/i18n/locales/en.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

/** Формы множественного числа у языков разные (ru: one/few/many/other, kk и en: one/other), сравниваем базовый ключ. */
const PLURAL = /_(zero|one|two|few|many|other)$/;
const baseKeys = (obj: unknown) => [...new Set(keys(obj).map((k) => k.replace(PLURAL, '')))].sort();
const pluralForms = (obj: unknown, base: string) => keys(obj).filter((k) => k.replace(PLURAL, '') === base && PLURAL.test(k));

describe('словари интерфейса', () => {
  it('у KZ, RU и EN одинаковый набор ключей и длины списков', () => {
    expect(baseKeys(kk)).toEqual(baseKeys(ru));
    expect(baseKeys(en)).toEqual(baseKeys(ru));
  });

  it('у множественного числа есть все формы, которых требует язык', () => {
    const required: Record<string, Intl.LDMLPluralRule[]> = {
      kk: new Intl.PluralRules('kk').resolvedOptions().pluralCategories,
      ru: new Intl.PluralRules('ru').resolvedOptions().pluralCategories,
      en: new Intl.PluralRules('en').resolvedOptions().pluralCategories,
    };
    const dicts: Record<string, unknown> = { kk, ru, en };
    const bases = [...new Set(keys(ru).filter((k) => PLURAL.test(k)).map((k) => k.replace(PLURAL, '')))];
    expect(bases.length).toBeGreaterThan(0);
    for (const [lang, dict] of Object.entries(dicts)) {
      for (const base of bases) {
        const forms = pluralForms(dict, base).map((k) => k.slice(base.length + 1));
        for (const form of required[lang] ?? []) expect(forms, `${lang}: ${base}_${form}`).toContain(form);
      }
    }
  });

  it('нет пустых строк', () => {
    const values = (obj: unknown): unknown[] =>
      typeof obj === 'object' && obj !== null ? Object.values(obj).flatMap(values) : [obj];
    for (const dict of [kk, ru, en]) for (const v of values(dict)) expect(String(v).trim()).not.toBe('');
  });
});
