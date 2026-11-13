import { readStorage, writeStorage } from './storage.ts';

/**
 * Версия для слабовидящих и пауза анимации (дизайн «Небо и золото», 11.11.2026). Отдельной панели настроек
 * в обычной версии нет — требование заказчика: одна кнопка «Версия для слабовидящих» включает режим, и сверху
 * появляется панель с размером текста, цветом и картинками. Хранится только в localStorage (Q-16).
 * Та же логика продублирована в инлайн-скрипте index.html, чтобы применить режим до первой отрисовки;
 * тест tests/a11y-prefs.test.ts сверяет оба варианта.
 */
export const A11Y_STORAGE_KEY = 'archive-vko:a11y';

export const SIZES = ['l', 'xl'] as const;
/** Размер текста вне версии для слабовидящих: обычный, крупный, очень крупный. */
export const TEXTS = ['m', 'l', 'xl'] as const;
export const SCHEMES = ['bw', 'wb', 'blue'] as const;

export interface A11yPrefs {
  /** Версия для слабовидящих включена. */
  mode: boolean;
  /** Размер текста в версии: «Крупный» (×1.3) или «Очень крупный» (×1.6). */
  size: (typeof SIZES)[number];
  /** Цвет: чёрным по белому, белым по чёрному, синим по голубому. */
  scheme: (typeof SCHEMES)[number];
  /** Размер текста из меню доступности (когда версия для слабовидящих выключена). */
  text: (typeof TEXTS)[number];
  /** Анимация остановлена кнопкой в шапке (WCAG 2.2.2). */
  still: boolean;
}

export const DEFAULT_PREFS: A11yPrefs = { mode: false, size: 'l', scheme: 'bw', text: 'm', still: false };

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback;

/** Неизвестные или повреждённые значения заменяются значениями по умолчанию. */
export function sanitizePrefs(raw: unknown): A11yPrefs {
  const v = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    mode: v['mode'] === true,
    size: oneOf(SIZES, v['size'], DEFAULT_PREFS.size),
    scheme: oneOf(SCHEMES, v['scheme'], DEFAULT_PREFS.scheme),
    text: oneOf(TEXTS, v['text'], DEFAULT_PREFS.text),
    still: v['still'] === true,
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

/** Классы на <html>, на которые опирается design.css: a11y, a11y-xl, a11y-wb, a11y-blue, txt-l, txt-xl, no-motion. */
export function prefsClasses(prefs: A11yPrefs): string[] {
  const list: string[] = [];
  if (prefs.mode) {
    list.push('a11y');
    if (prefs.size === 'xl') list.push('a11y-xl');
    if (prefs.scheme === 'wb') list.push('a11y-wb');
    if (prefs.scheme === 'blue') list.push('a11y-blue');
  } else if (prefs.text !== 'm') list.push(`txt-${prefs.text}`);
  if (prefs.still) list.push('no-motion');
  return list;
}

export const ALL_CLASSES = ['a11y', 'a11y-xl', 'a11y-wb', 'a11y-blue', 'a11y-noimg', 'txt-l', 'txt-xl', 'no-motion'] as const;

/** Переносит режим на <html>: классы дизайна и data-атрибуты (data-theme нужен токенам, data-motion — тестам). */
export function applyPrefs(prefs: A11yPrefs, root: HTMLElement): void {
  const on = new Set(prefsClasses(prefs));
  for (const c of ALL_CLASSES) root.classList.toggle(c, on.has(c));
  root.dataset['theme'] = 'light';
  root.dataset['contrast'] = prefs.mode ? 'high' : 'normal';
  root.dataset['motion'] = prefs.mode || prefs.still ? 'reduce' : 'full';
}
