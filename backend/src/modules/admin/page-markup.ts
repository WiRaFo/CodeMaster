/**
 * Простая разметка справочных страниц для редактора в панели (без HTML: текст не может внести разметку или скрипт).
 *   ## Заголовок
 *   - пункт списка            1. пункт нумерованного списка
 *   ! сведения ожидаются от архива (блок «Ожидаются сведения архива»)
 *   [Название](https://адрес) — примечание   (внешняя ссылка; только https)
 * Пустая строка разделяет абзацы.
 */
export type InfoBlock =
  | { type: 'p' | 'h' | 'pending'; text: string }
  | { type: 'ol' | 'ul'; items: string[] }
  | { type: 'links'; items: Array<{ label: string; url: string; note?: string }> };

export interface MarkupIssue { line: number; message: string }

const LINK = /^\[([^\]]{1,300})\]\((\S{1,500})\)(?:\s+[—-]\s+(.{1,500}))?$/;

export function parseMarkup(text: string): { blocks: InfoBlock[]; issues: MarkupIssue[] } {
  const blocks: InfoBlock[] = [];
  const issues: MarkupIssue[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  const pushItem = (type: 'ul' | 'ol', item: string) => {
    const last = blocks[blocks.length - 1];
    if (last && last.type === type) last.items.push(item);
    else blocks.push({ type, items: [item] });
  };
  text.replace(/\r\n?/g, '\n').split('\n').forEach((raw, index) => {
    const line = raw.trim();
    const n = index + 1;
    if (!line) return flush();
    let m: RegExpExecArray | null;
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'h', text: line.slice(3).trim() }); return; }
    if (line.startsWith('! ')) { flush(); blocks.push({ type: 'pending', text: line.slice(2).trim() }); return; }
    if (line.startsWith('- ')) { flush(); pushItem('ul', line.slice(2).trim()); return; }
    if ((m = /^\d+[.)]\s+(.+)$/.exec(line))) { flush(); pushItem('ol', m[1] ?? ''); return; }
    if (line.startsWith('[')) {
      flush();
      m = LINK.exec(line);
      if (!m) { issues.push({ line: n, message: 'Ссылка записывается так: [Название](https://адрес) — примечание' }); return; }
      const url = m[2] ?? '';
      let valid = false;
      try {
        valid = new URL(url).protocol === 'https:';
      } catch {
        valid = false;
      }
      if (!valid) { issues.push({ line: n, message: `Адрес ссылки должен начинаться с https:// (${url})` }); return; }
      const item = { label: m[1] ?? '', url, ...(m[3] ? { note: m[3] } : {}) };
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'links') last.items.push(item);
      else blocks.push({ type: 'links', items: [item] });
      return;
    }
    paragraph.push(line);
  });
  flush();
  if (!blocks.length) issues.push({ line: 1, message: 'Страница пустая' });
  return { blocks, issues };
}

export function toMarkup(blocks: readonly InfoBlock[]): string {
  return blocks.map((b) => {
    switch (b.type) {
      case 'h': return `## ${b.text}`;
      case 'p': return b.text;
      case 'pending': return `! ${b.text}`;
      case 'ul': return b.items.map((i) => `- ${i}`).join('\n');
      case 'ol': return b.items.map((i, k) => `${k + 1}. ${i}`).join('\n');
      case 'links': return b.items.map((l) => `[${l.label}](${l.url})${l.note ? ` — ${l.note}` : ''}`).join('\n');
    }
  }).join('\n\n');
}
