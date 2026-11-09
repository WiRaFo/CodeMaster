import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { A11Y_STORAGE_KEY, applyPrefs, DEFAULT_PREFS, loadPrefs, sanitizePrefs, type A11yPrefs } from '../src/lib/a11y-prefs.ts';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

function snapshot(root: HTMLElement) {
  return {
    dataset: { ...root.dataset },
    fontSize: root.style.getPropertyValue('--a11y-font-size') || '100%',
    lineHeight: root.style.getPropertyValue('--a11y-line-height') || '1.5',
    letterSpacing: root.style.getPropertyValue('--a11y-letter-spacing') || 'normal',
    wordSpacing: root.style.getPropertyValue('--a11y-word-spacing') || 'normal',
  };
}

function reset(root: HTMLElement) {
  for (const key of Object.keys(root.dataset)) delete root.dataset[key];
  root.removeAttribute('style');
}

describe('настройки доступности', () => {
  it('повреждённые и неизвестные значения заменяются значениями по умолчанию', () => {
    expect(sanitizePrefs({ fontScale: 300, scheme: 'neon', highContrast: 'yes' })).toEqual(DEFAULT_PREFS);
    window.localStorage.setItem(A11Y_STORAGE_KEY, '{not json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('applyPrefs выставляет атрибуты и переменные, включая межсловный интервал WCAG 1.4.12', () => {
    const root = document.documentElement;
    applyPrefs({ ...DEFAULT_PREFS, fontScale: 200, letterSpacing: '0.16', highContrast: true, scheme: 'dark' }, root, {
      dark: false,
      reduceMotion: true,
    });
    expect(snapshot(root)).toEqual({
      dataset: { theme: 'dark', contrast: 'high', font: 'default', motion: 'reduce', simplified: 'off' },
      fontSize: '200%',
      lineHeight: '1.5',
      letterSpacing: '0.16em',
      wordSpacing: '0.16em',
    });
  });

  const cases: Array<Partial<A11yPrefs>> = [
    {},
    { fontScale: 150, lineHeight: '2', letterSpacing: '0.12', scheme: 'alt', readableFont: true, simplified: true },
    { highContrast: true, scheme: 'dark', motion: 'full' },
    { scheme: 'light', motion: 'reduce', lineHeight: '1.8' },
  ];
  it.each(cases)('инлайн-скрипт index.html применяет те же настройки, что applyPrefs: %o', (patch) => {
    const prefs = { ...DEFAULT_PREFS, ...patch };
    const root = document.documentElement;
    applyPrefs(prefs, root, { dark: false, reduceMotion: false });
    const expected = snapshot(root);
    reset(root);
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    new Function(inlineScript)();
    expect(snapshot(root)).toEqual(expected);
  });
});
