import { readStorage, writeStorage } from './storage.ts';

/**
 * Настройки панели доступности (docs/accessibility.md §5). Хранятся только в localStorage (Q-16).
 * Та же логика продублирована в инлайн-скрипте index.html, чтобы применить настройки до первой отрисовки;
 * тест tests/a11y-prefs.test.ts сверяет оба варианта.
 */
export const A11Y_STORAGE_KEY = 'archive-vko:a11y';

export const FONT_SCALES = [100, 125, 150, 175, 200] as const;
export const LINE_HEIGHTS = ['normal', '1.8', '2'] as const;
export const LETTER_SPACINGS = ['normal', '0.12', '0.16'] as const;
export const SCHEMES = ['system', 'light', 'dark', 'alt'] as const;
export const MOTIONS = ['system', 'reduce', 'full'] as const;

export interface A11yPrefs {
  fontScale: (typeof FONT_SCALES)[number];
  lineHeight: (typeof LINE_HEIGHTS)[number];
  letterSpacing: (typeof LETTER_SPACINGS)[number];
  highContrast: boolean;
  scheme: (typeof SCHEMES)[number];
  readableFont: boolean;
  motion: (typeof MOTIONS)[number];
  simplified: boolean;
}

export const DEFAULT_PREFS: A11yPrefs = {
  fontScale: 100,
  lineHeight: 'normal',
  letterSpacing: 'normal',
  highContrast: false,
  scheme: 'system',
  readableFont: false,
  motion: 'system',
  simplified: false,
};

const oneOf = <T extends string | number>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

/** Неизвестные или повреждённые значения заменяются значениями по умолчанию. */
export function sanitizePrefs(raw: unknown): A11yPrefs {
  const v = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    fontScale: oneOf(FONT_SCALES, v['fontScale'], DEFAULT_PREFS.fontScale),
    lineHeight: oneOf(LINE_HEIGHTS, v['lineHeight'], DEFAULT_PREFS.lineHeight),
    letterSpacing: oneOf(LETTER_SPACINGS, v['letterSpacing'], DEFAULT_PREFS.letterSpacing),
    highContrast: v['highContrast'] === true,
    scheme: oneOf(SCHEMES, v['scheme'], DEFAULT_PREFS.scheme),
    readableFont: v['readableFont'] === true,
    motion: oneOf(MOTIONS, v['motion'], DEFAULT_PREFS.motion),
    simplified: v['simplified'] === true,
  };
}

export function loadPrefs(): A11yPrefs {
  const raw = readStorage(A11Y_STORAGE_KEY);
  if (!raw) return DEFAULT_PREFS;
  try {
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: A11yPrefs): void {
  writeStorage(A11Y_STORAGE_KEY, JSON.stringify(prefs));
}

export interface SystemPrefs {
  dark: boolean;
  reduceMotion: boolean;
}

export function systemPrefs(): SystemPrefs {
  const query = (q: string) => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  return { dark: query('(prefers-color-scheme: dark)'), reduceMotion: query('(prefers-reduced-motion: reduce)') };
}

export function resolvedTheme(prefs: A11yPrefs, system: SystemPrefs): 'light' | 'dark' | 'alt' {
  return prefs.scheme === 'system' ? (system.dark ? 'dark' : 'light') : prefs.scheme;
}

/** Переносит настройки на <html> через data-атрибуты и CSS-переменные (см. src/styles/index.css). */
export function applyPrefs(prefs: A11yPrefs, root: HTMLElement, system: SystemPrefs): void {
  root.dataset['theme'] = resolvedTheme(prefs, system);
  root.dataset['contrast'] = prefs.highContrast ? 'high' : 'normal';
  root.dataset['font'] = prefs.readableFont ? 'readable' : 'default';
  root.dataset['motion'] = prefs.motion === 'system' ? (system.reduceMotion ? 'reduce' : 'full') : prefs.motion;
  root.dataset['simplified'] = prefs.simplified ? 'on' : 'off';
  root.style.setProperty('--a11y-font-size', `${prefs.fontScale}%`);
  root.style.setProperty('--a11y-line-height', prefs.lineHeight === 'normal' ? '1.5' : prefs.lineHeight);
  const spacing = prefs.letterSpacing === 'normal' ? 'normal' : `${prefs.letterSpacing}em`;
  root.style.setProperty('--a11y-letter-spacing', spacing);
  // WCAG 1.4.12: вместе с межбуквенным увеличивается межсловный интервал.
  root.style.setProperty('--a11y-word-spacing', prefs.letterSpacing === 'normal' ? 'normal' : '0.16em');
}
