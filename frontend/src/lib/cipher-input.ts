import { ARCHIVE_CODE_LABELS, type ArchiveCodeLabels } from '@archive-vko/shared';

/**
 * Подсказка при вводе архивного шифра в поле поиска.
 * Если запрос начинается с «Ф.» (или «Қ.», «F.») и номера, поле переходит в режим шифра:
 * после номера пробел подставляет следующую часть («. Оп. », «. Д. », «. Л. »), а оставшиеся части
 * видны серым за текстом. Обычный текстовый поиск это не затрагивает: «фото 1960» шифром не считается.
 */

type Part = keyof ArchiveCodeLabels;
const ORDER: readonly Part[] = ['fond', 'inventory', 'case', 'sheets'];

/** Набор подписей по первой букве: ф — русские, қ — казахские, f — английские. */
const BY_LETTER: Record<string, ArchiveCodeLabels> = {
  ф: ARCHIVE_CODE_LABELS.ru,
  қ: ARCHIVE_CODE_LABELS.kk,
  f: ARCHIVE_CODE_LABELS.en,
};

/** «Ф. 1», «ф1», «Ф 12», «қ. Р-5», «F. 3»: буква фонда, точка или пробел (или сразу цифра), номер. */
const START = /^(ф|қ|f)(?:\.\s*|\s+|(?=\d))((?:[\p{L}]{1,4}-?)?\d)/iu;

export interface CipherState {
  labels: ArchiveCodeLabels;
  /** Части, которые уже начаты (подпись есть в тексте). */
  filled: number;
  /** У последней начатой части уже есть номер. */
  hasNumber: boolean;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Режим шифра для текущего значения поля или null, если это обычный запрос. */
export function cipherState(value: string): CipherState | null {
  const m = START.exec(value);
  if (!m) return null;
  const labels = BY_LETTER[m[1]!.toLowerCase()]!;
  let filled = 1;
  for (const part of ORDER.slice(1)) {
    if (new RegExp(`(?:^|[\\s.])${esc(labels[part])}(?:\\s|$)`, 'u').test(value)) filled = ORDER.indexOf(part) + 1;
  }
  const tail = value.slice(value.lastIndexOf(labels[ORDER[filled - 1]!]) + labels[ORDER[filled - 1]!].length);
  return { labels, filled, hasNumber: /\d/.test(tail) };
}

/** Приводит начало к виду «Ф. 1»: заглавная буква, точка и пробел. Остальное не трогает. */
export function normalizeCipherStart(value: string): string {
  const state = cipherState(value);
  if (!state) return value;
  return value.replace(/^(ф|қ|f)(?:\.\s*|\s+|(?=\d))/iu, `${state.labels.fond} `);
}

/** Серая подсказка за текстом: оставшиеся подписи частей. */
export function cipherGhost(value: string): string {
  const state = cipherState(value);
  if (!state) return '';
  const rest = ORDER.slice(state.filled).map((p) => state.labels[p]);
  return rest.length ? ` ${rest.join(' ')}` : '';
}

/**
 * Пробел в конце текста в режиме шифра. Возвращает новое значение или null, если пробел нужно
 * вставить как обычно (не режим шифра, курсор не в конце, части кончились).
 * Пробел без номера в текущей части ничего не делает, чтобы не плодить пустые части.
 */
export function cipherSpace(value: string): string | null {
  const state = cipherState(value);
  if (!state || state.filled >= ORDER.length) return null;
  if (!state.hasNumber) return value;
  const next = state.labels[ORDER[state.filled]!];
  return `${value.replace(/[\s.]+$/u, '')}. ${next} `;
}

/** Backspace сразу после подставленной подписи убирает её целиком: «Ф. 1. Оп. » → «Ф. 1». */
export function cipherBackspace(value: string): string | null {
  const state = cipherState(value);
  if (!state || state.filled < 2 || state.hasNumber) return null;
  const label = state.labels[ORDER[state.filled - 1]!];
  const cut = new RegExp(`[\\s.]*${esc(label)}\\s*$`, 'u');
  return cut.test(value) ? value.replace(cut, '') : null;
}

/** Перед отправкой: убирает незаполненную последнюю подпись и лишние знаки в конце. */
export function cleanCipher(value: string): string {
  const back = cipherBackspace(value);
  return (back ?? value).trim().replace(/[\s.]+$/u, '');
}
