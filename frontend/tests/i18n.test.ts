import { describe, expect, it } from 'vitest';
import kk from '../src/i18n/locales/kk.json';
import ru from '../src/i18n/locales/ru.json';
import en from '../src/i18n/locales/en.json';

function keys(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [`${prefix}[${obj.length}]`];
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe('словари интерфейса', () => {
  it('у KZ, RU и EN одинаковый набор ключей и длины списков', () => {
    expect(keys(kk).sort()).toEqual(keys(ru).sort());
    expect(keys(en).sort()).toEqual(keys(ru).sort());
  });

  it('нет пустых строк', () => {
    const values = (obj: unknown): unknown[] =>
      typeof obj === 'object' && obj !== null ? Object.values(obj).flatMap(values) : [obj];
    for (const dict of [kk, ru, en]) for (const v of values(dict)) expect(String(v).trim()).not.toBe('');
  });
});
