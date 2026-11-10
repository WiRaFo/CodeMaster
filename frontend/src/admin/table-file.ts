/**
 * Чтение таблицы для импорта: CSV (UTF-8, разделитель «;», «,» или табуляция) и XLSX (первый лист).
 * Результат — заголовок и строки как текст; проверку каждой строки делает сервер.
 */
export interface TableData { header: string[]; rows: string[][] }

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', '\t', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ';';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const pad = (n: number) => String(n).padStart(2, '0');

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return `${pad(value.getUTCDate())}.${pad(value.getUTCMonth() + 1)}.${value.getUTCFullYear()}`;
  return String(value).trim();
}

export async function readTableFile(file: File): Promise<TableData> {
  let table: string[][];
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const sheet = await readSheet(file);
    table = sheet.map((r) => r.map(cellText)).filter((r) => r.some((c) => c !== ''));
  } else if (/\.(csv|txt|tsv)$/i.test(file.name)) {
    table = parseCsv(await file.text());
  } else {
    throw new Error('Поддерживаются файлы CSV и XLSX.');
  }
  const [header, ...rows] = table;
  if (!header || rows.length === 0) throw new Error('В файле нет строк с данными: нужна строка заголовков и хотя бы одна строка.');
  const width = header.length;
  return { header, rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) };
}
