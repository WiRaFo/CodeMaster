import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Проверка контраста токенов (docs/accessibility.md §2): разбирает src/styles/tokens.css
 * и сверяет пары по WCAG 2.2: 4.5:1 для текста, 3:1 для границ полей и индикатора фокуса.
 */

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function parseThemes(source: string): Map<string, Record<string, string>> {
  const themes = new Map<string, Record<string, string>>();
  const blockRe = /([^{}]+)\{([^}]*)\}/g;
  for (const [, selector = '', body = ''] of source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(blockRe)) {
    const vars: Record<string, string> = {};
    for (const [, name = '', value = ''] of body.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[name] = value;
    themes.set(selector.trim().replace(/\s+/g, ' '), vars);
  }
  return themes;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: Array<[string, string]> = [
  ['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'],
  ['text-muted', 'bg'], ['text-muted', 'surface'], ['text-muted', 'surface-2'],
  ['primary', 'bg'], ['primary', 'surface'], ['primary', 'surface-2'], ['primary-hover', 'bg'], ['primary-hover', 'surface'],
  ['on-primary', 'primary'], ['on-primary', 'primary-hover'],
  ['accent', 'bg'], ['danger', 'bg'], ['danger', 'surface'],
  ['warning-text', 'warning-bg'], ['demo-text', 'demo-bg'],
];
const UI_PAIRS: Array<[string, string]> = [
  ['border', 'bg'], ['border', 'surface'], ['focus', 'bg'], ['focus', 'surface'], ['focus', 'surface-2'],
];

const themes = parseThemes(css);

describe('контраст дизайн-токенов', () => {
  it('в файле пять тем с полным набором токенов', () => {
    expect(themes.size).toBe(5);
    const names = Object.keys([...themes.values()][0] ?? {}).sort();
    for (const vars of themes.values()) expect(Object.keys(vars).sort()).toEqual(names);
  });

  for (const [selector, vars] of themes) {
    it(`тема ${selector}`, () => {
      const failures: string[] = [];
      const check = (pairs: Array<[string, string]>, min: number) => {
        for (const [fg, bg] of pairs) {
          const a = vars[fg];
          const b = vars[bg];
          if (!a || !b) failures.push(`нет токена ${fg} или ${bg}`);
          else if (contrast(a, b) < min) failures.push(`${fg}/${bg} = ${contrast(a, b).toFixed(2)} < ${min}`);
        }
      };
      check(TEXT_PAIRS, 4.5);
      check(UI_PAIRS, 3);
      expect(failures).toEqual([]);
    });
  }

  it('тёмные темы не используют чистый чёрный фон в обычном режиме', () => {
    const dark = [...themes.entries()].find(([s]) => s === ":root[data-theme='dark']")?.[1];
    expect(dark?.['bg']).not.toBe('#000000');
  });

  it('формула контраста совпадает с эталоном WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#BA9937', '#FBF8EF')).toBeCloseTo(2.57, 1); // ссылка текущего сайта из аудита
  });
});
