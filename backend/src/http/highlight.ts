/** Маркеры, которыми PostgreSQL ts_headline обрамляет совпадения; в тексте каталога не встречаются. */
export const HL_START = '\u0002';
export const HL_STOP = '\u0003';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Превращает фрагмент ts_headline в безопасный HTML: весь текст экранируется,
 * разрешён только тег <mark> (docs/api-design.md §3). Без совпадений возвращает null.
 */
export function toSafeHighlight(fragment: string | null): string | null {
  if (!fragment || !fragment.includes(HL_START)) return null;
  const escaped = fragment.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
  return escaped.replaceAll(HL_START, '<mark>').replaceAll(HL_STOP, '</mark>');
}
