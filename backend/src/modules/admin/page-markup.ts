/**
 * Простая разметка справочных страниц для редактора в панели (без HTML: текст не может внести разметку или скрипт).
 *   ## Заголовок
 *   - пункт списка            1. пункт нумерованного списка
 *   ! сведения ожидаются от архива (блок «Ожидаются сведения архива»)
 *   [Название](https://адрес) — примечание   (внешняя ссылка; только https)
 *   [Название](/files/documents/файл.pdf) — примечание   (документ, опубликованный на самом сайте)
 *   | Столбец | Столбец |     (таблица: первая строка — заголовки, следующие подряд строки с «|» — данные)
 * Пустая строка разделяет абзацы.
 */
export type InfoBlock =
  | { type: 'p' | 'h' | 'pending'; text: string }
  | { type: 'ol' | 'ul'; items: string[] }
  | { type: 'links'; items: Array<{ label: string; url: string; note?: string }> }
  | { type: 'table'; head: string[]; rows: string[][] };

/** Текст блоков для полнотекстового поиска (body_text). */
export function blocksPlainText(blocks: readonly InfoBlock[]): string {
  return blocks.map((b) => {
    switch (b.type) {
      case 'links': return b.items.map((l) => [l.label, l.note].filter(Boolean).join(' — ')).join('\n');
      case 'table': return [b.head, ...b.rows].map((r) => r.filter(Boolean).join(' ')).join('\n');
      case 'ol': case 'ul': return b.items.join('\n');
      default: return b.text;
    }
  }).join('\n\n');
}

const MAX_COLUMNS = 6;
const cells = (line: string) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export interface MarkupIssue { line: number; message: string }

/** Файл, опубликованный на самом сайте (frontend/public/files/documents). */
export const SITE_FILE = /^\/files\/documents\/[a-z0-9][a-z0-9._-]*\.pdf$/;
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
  let tableOpen = false;
  text.replace(/\r\n?/g, '\n').split('\n').forEach((raw, index) => {
    const line = raw.trim();
    const n = index + 1;
    const wasTable = tableOpen;
    tableOpen = false;
    if (!line) return flush();
    if (line.startsWith('|')) {
      flush();
      const row = cells(line);
      const last = blocks[blocks.length - 1];
      if (wasTable && last && last.type === 'table') {
        if (row.length !== last.head.length) { issues.push({ line: n, message: `В строке таблицы ${row.length} ячеек, а в заголовке ${last.head.length}` }); return; }
        last.rows.push(row);
      } else {
        if (row.length < 2 || row.length > MAX_COLUMNS || row.some((c) => !c)) { issues.push({ line: n, message: `Заголовок таблицы: от 2 до ${MAX_COLUMNS} непустых столбцов через «|»` }); return; }
        blocks.push({ type: 'table', head: row, rows: [] });
      }
      tableOpen = true;
      return;
    }
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
      let valid = SITE_FILE.test(url);
      try {
        valid ||= new URL(url).protocol === 'https:';
      } catch {
        // не абсолютный адрес
      }
      if (!valid) { issues.push({ line: n, message: `Адрес ссылки должен начинаться с https:// или /files/documents/ (${url})` }); return; }
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
      case 'table': return [b.head, ...b.rows].map((r) => `| ${r.join(' | ')} |`).join('\n');
    }
  }).join('\n\n');
}
