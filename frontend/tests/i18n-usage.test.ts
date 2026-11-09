import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import kk from '../src/i18n/locales/kk.json';
import ru from '../src/i18n/locales/ru.json';
import en from '../src/i18n/locales/en.json';

/**
 * ЭТАП 11a: проверка «без литералов» для публичной части сайта.
 * Панель управления (src/admin) по решению ЭТАПА 10a только на русском и сюда не входит.
 */
const SRC = join(__dirname, '../src');
const DICTS = { kk, ru, en } as const;
const PLURAL = /_(zero|one|two|few|many|other)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'admin' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

function lookup(dict: unknown, key: string): unknown {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Ключ существует сам по себе или как основа форм множественного числа. */
function hasKey(dict: unknown, key: string): boolean {
  if (lookup(dict, key) !== undefined) return true;
  const dot = key.lastIndexOf('.');
  const parent = lookup(dict, key.slice(0, dot));
  const leaf = key.slice(dot + 1);
  return typeof parent === 'object' && parent !== null && Object.keys(parent).some((k) => k.replace(PLURAL, '') === leaf && PLURAL.test(k));
}

interface Found {
  keys: Array<{ key: string; where: string }>;
  prefixes: Array<{ prefix: string; where: string }>;
  literals: string[];
}

/** Атрибуты, текст которых видит или слышит посетитель. */
const TEXT_ATTRS = new Set(['aria-label', 'aria-description', 'aria-roledescription', 'title', 'alt', 'placeholder', 'label']);
const LETTER = /\p{L}/u;

function scan(): Found {
  const found: Found = { keys: [], prefixes: [], literals: [] };
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const where = (node: ts.Node) => `${relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const isT = (ts.isIdentifier(callee) && callee.text === 't') || (ts.isPropertyAccessExpression(callee) && callee.name.text === 't');
        const arg = node.arguments[0];
        if (isT && arg) {
          if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) found.keys.push({ key: arg.text, where: where(node) });
          else if (ts.isTemplateExpression(arg)) found.prefixes.push({ prefix: arg.head.text.replace(/\.$/, ''), where: where(node) });
        }
      }
      if (ts.isJsxText(node) && LETTER.test(node.text)) found.literals.push(`${where(node)}: «${node.text.trim()}»`);
      if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText()) && node.initializer && ts.isStringLiteral(node.initializer) && LETTER.test(node.initializer.text)) {
        found.literals.push(`${where(node)}: ${node.name.getText()}="${node.initializer.text}"`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

const found = scan();

describe('тексты интерфейса берутся только из словарей (ЭТАП 11a)', () => {
  it('в разметке публичных страниц нет текста, написанного прямо в коде', () => {
    expect(found.literals).toEqual([]);
  });

  it('каждый ключ t("…") есть во всех трёх словарях', () => {
    expect(found.keys.length).toBeGreaterThan(100);
    const missing = found.keys.flatMap(({ key, where }) =>
      Object.entries(DICTS).filter(([, dict]) => !hasKey(dict, key)).map(([lang]) => `${lang}: ${key} (${where})`),
    );
    expect(missing).toEqual([]);
  });

  it('у ключей вида t(`раздел.${…}`) раздел есть во всех словарях', () => {
    const missing = found.prefixes.flatMap(({ prefix, where }) =>
      Object.entries(DICTS).filter(([, dict]) => typeof lookup(dict, prefix) !== 'object').map(([lang]) => `${lang}: ${prefix} (${where})`),
    );
    expect(missing).toEqual([]);
  });
});

function flat(obj: unknown, prefix = ''): Record<string, string> {
  if (typeof obj !== 'object' || obj === null) return { [prefix]: String(obj) };
  return Object.assign({}, ...Object.entries(obj).map(([k, v]) => flat(v, prefix ? `${prefix}.${k}` : k)));
}

describe('качество переводов', () => {
  /** Совпадения с русским, которые верны: самоназвания языков и слова, одинаковые в казахском. */
  const SAME_AS_RU: Record<'kk' | 'en', string[]> = {
    kk: ['lang.kk', 'lang.ru', 'lang.en', 'a11y.motion', 'footer.phone', 'origin.demo', 'exhibitions.itemCount_one'],
    en: ['lang.kk', 'lang.ru', 'lang.en'],
  };

  it('казахский и английский тексты не скопированы с русского', () => {
    const ruFlat = flat(ru);
    for (const lang of ['kk', 'en'] as const) {
      const copied = Object.entries(flat(DICTS[lang])).filter(([k, v]) => ruFlat[k] === v && !SAME_AS_RU[lang].includes(k)).map(([k]) => k);
      expect(copied, lang).toEqual([]);
    }
  });

  it('в английском словаре нет кириллицы, кроме самоназваний языков', () => {
    const cyr = Object.entries(flat(en)).filter(([k, v]) => /[а-яё]/i.test(v) && !k.startsWith('lang.')).map(([k]) => k);
    expect(cyr).toEqual([]);
  });

  it('в казахском словаре единый термин «мұрағат», а не «архив»', () => {
    const mixed = Object.entries(flat(kk)).filter(([, v]) => /архив/i.test(v)).map(([k]) => k);
    expect(mixed).toEqual([]);
  });

  it('архивные шифры в примерах подписаны сокращениями своего языка', () => {
    expect(kk.a11y.sample).toMatch(/Қ\. 12\. Тізб\. 3\. Іс 45/);
    expect(ru.a11y.sample).toMatch(/Ф\. 12\. Оп\. 3\. Д\. 45/);
    expect(en.a11y.sample).toMatch(/F\. 12\. Inv\. 3\. File 45/);
  });
});
