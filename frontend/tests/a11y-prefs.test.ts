import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { A11Y_STORAGE_KEY, applyPrefs, DEFAULT_PREFS, loadPrefs, sanitizePrefs, type A11yPrefs } from '../src/lib/a11y-prefs.ts';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const inlineScript = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

const snapshot = (root: HTMLElement) => ({ classes: [...root.classList].sort(), dataset: { ...root.dataset } });
function reset(root: HTMLElement) {
  for (const key of Object.keys(root.dataset)) delete root.dataset[key];
  root.className = '';
}

describe('версия для слабовидящих', () => {
  it('повреждённые и неизвестные значения заменяются значениями по умолчанию', () => {
    expect(sanitizePrefs({ mode: 'yes', size: 'xxl', scheme: 'neon', images: 'no', still: 1 })).toEqual(DEFAULT_PREFS);
    window.localStorage.setItem(A11Y_STORAGE_KEY, '{not json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('applyPrefs ставит классы дизайна; без версии схема и размер не действуют', () => {
    const root = document.documentElement;
    reset(root);
    applyPrefs({ mode: true, size: 'xl', scheme: 'wb', images: false, still: false }, root);
    expect(snapshot(root)).toEqual({ classes: ['a11y', 'a11y-noimg', 'a11y-wb', 'a11y-xl'], dataset: { theme: 'light', contrast: 'high', motion: 'reduce' } });
    applyPrefs({ mode: false, size: 'xl', scheme: 'wb', images: false, still: true }, root);
    expect(snapshot(root)).toEqual({ classes: ['no-motion'], dataset: { theme: 'light', contrast: 'normal', motion: 'reduce' } });
  });

  const cases: Array<Partial<A11yPrefs>> = [
    {},
    { mode: true },
    { mode: true, size: 'xl', scheme: 'blue', images: false },
    { mode: true, scheme: 'wb', still: true },
    { still: true, scheme: 'blue' },
  ];
  it.each(cases)('инлайн-скрипт index.html применяет то же, что applyPrefs: %o', (patch) => {
    const prefs = { ...DEFAULT_PREFS, ...patch };
    const root = document.documentElement;
    reset(root);
    applyPrefs(prefs, root);
    const expected = snapshot(root);
    reset(root);
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    new Function(inlineScript)();
    expect(snapshot(root)).toEqual(expected);
  });
});
