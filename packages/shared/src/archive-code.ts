import type { Locale } from './enums.ts';

/**
 * Архивный шифр: Ф. {фонд}. Оп. {опись}. Д. {дело}. Л. {листы}.
 * Номера — строки: бывают префиксы и литеры («Р-123», «П-5», «12а», «15об»). См. docs/database-design.md §3.
 */
export interface ArchiveCode {
  fond: string;
  inventory?: string | undefined;
  case?: string | undefined;
  sheets?: string | undefined;
}

/**
 * Сокращения по языкам. Казахские и английские варианты — предложение команды,
 * требуют утверждения архивом (database-design.md §3).
 */
const LABELS: Record<Locale, { fond: string; inventory: string; case: string; sheets: string }> = {
  ru: { fond: 'Ф.', inventory: 'Оп.', case: 'Д.', sheets: 'Л.' },
  kk: { fond: 'Қ.', inventory: 'Тізб.', case: 'Іс', sheets: 'П.' },
  en: { fond: 'F.', inventory: 'Inv.', case: 'File', sheets: 'Fol.' },
};

export function formatArchiveCode(code: ArchiveCode, locale: Locale = 'ru'): string {
  const l = LABELS[locale];
  const parts = [`${l.fond} ${code.fond}`];
  if (code.inventory) parts.push(`${l.inventory} ${code.inventory}`);
  if (code.case) parts.push(`${l.case} ${code.case}`);
  if (code.sheets) parts.push(`${l.sheets} ${code.sheets}`);
  return `${parts.join('. ')}.`.replace(/\.\.$/, '.');
}

const NUMBER = String.raw`([A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]{0,3}-?\d+[A-Za-zА-Яа-яЁё]{0,3})`;

const FOND_RE = new RegExp(String.raw`(?:^|[\s.,;])(?:ф|фонд|қ|қор|f|fond|fonds)\.?\s*(?:№\s*)?${NUMBER}`, 'iu');
const INV_RE = new RegExp(String.raw`(?:оп|опись|тізб|тізбе|inv|inventory|op)\.?\s*(?:№\s*)?${NUMBER}`, 'iu');
const CASE_RE = new RegExp(String.raw`(?:^|[\s.,;])(?:д|дело|іс|file|case|d)\.?\s*(?:№\s*)?${NUMBER}`, 'iu');
const SHEETS_RE = /(?:л|лл|листы|п|парақ|fol|f{2})\.?\s*(\d+[а-яa-z]*(?:\s*[-–]\s*\d+[а-яa-z]*)?)/iu;

/**
 * Разбор свободно введённого шифра («Ф. Р-123. Оп. 1. Д. 45», «ф р-123 оп 1 д 45», «F. R-123 Inv. 1 File 45»).
 * Возвращает null, если номер фонда не найден. Регистр префикса фонда нормализуется к верхнему.
 */
export function parseArchiveCode(input: string): ArchiveCode | null {
  const text = ` ${input.trim()}`;
  const fond = FOND_RE.exec(text)?.[1];
  if (!fond) return null;
  const afterFond = text.slice(text.indexOf(fond) + fond.length);
  const inventory = INV_RE.exec(afterFond)?.[1];
  const afterInv = inventory ? afterFond.slice(afterFond.indexOf(inventory) + inventory.length) : afterFond;
  const kase = CASE_RE.exec(` ${afterInv}`)?.[1];
  const afterCase = kase ? afterInv.slice(afterInv.indexOf(kase) + kase.length) : '';
  const sheets = kase ? SHEETS_RE.exec(afterCase)?.[1]?.replace(/\s+/g, '') : undefined;
  return {
    fond: normalizeNumber(fond),
    inventory: inventory ? normalizeNumber(inventory) : undefined,
    case: kase ? normalizeNumber(kase) : undefined,
    sheets,
  };
}

function normalizeNumber(value: string): string {
  // Буквенный префикс фонда («р-123») пишется заглавными; литера после цифр («12а») — строчными.
  return value.replace(/^([^\d-]+)(-?)/u, (_m, prefix: string, dash: string) => `${prefix.toUpperCase()}${dash}`);
}
