import type { ParsedQuery } from './query-parser.ts';

/**
 * Намерение вопроса по правилам (ТЗ §5.8 А, с. 10). Порядок проверки важен:
 * 1) просьба подать заявление, заказать или оплатить — сайт этого не делает (§5.8, с. 10; F-122, S-021);
 * 2) адреса и контакты; 3) архивные термины; 4) разделы сайта; 5) поиск по каталогу.
 */
export const TERMS = ['fond', 'inventory', 'case', 'sheet', 'archiveCode', 'restricted', 'readingRoom', 'digitalCopy'] as const;
export type Term = (typeof TERMS)[number];
export const SECTIONS = ['exhibitions', 'news', 'history', 'accessibility', 'faq', 'about', 'visitors', 'catalog', 'branches'] as const;
export type Section = (typeof SECTIONS)[number];

export type Intent =
  | { kind: 'service_request' }
  | { kind: 'branch' }
  | { kind: 'term'; term: Term; links: Section[] }
  | { kind: 'navigation'; section: Section }
  | { kind: 'search' }
  | { kind: 'unknown' };

const has = (text: string, patterns: RegExp[]) => patterns.some((p) => p.test(text));

const SERVICE = [
  /заявлени/u, /подать/u, /заказ/u, /оплат/u, /стоимост/u, /сколько стоит/u, /получить (архивную )?справк/u, /архивн\S* справк/u,
  /выдать справк/u, /запрос (на|о)(?!\p{L})/u, /отправить запрос/u, /обращени/u, /жалоб/u,
  /өтініш/u, /анықтама (алу|беру|алғым)/u, /мұрағаттық анықтама/u, /тапсырыс/u, /төлем/u, /сұрау салу/u,
  /\bappl(y|ication)\b/u, /\border\b/u, /\bpay(ment)?\b/u, /certificate/u, /request (a|an|for)\b/u, /\bfee\b/u, /submit/u,
];
const BRANCH = [
  /адрес/u, /телефон/u, /филиал/u, /режим работы/u, /график работы/u, /часы работы/u, /как добраться/u, /где находит/u, /читальн\S* зал/u, /контакт/u, /когда работает/u,
  /мекенжай/u, /жұмыс уақыт/u, /қалай жетуге/u, /қайда орналасқан/u, /оқу зал/u, /байланыс/u,
  /address/u, /phone/u, /\bbranch/u, /opening hours/u, /how (do i|to) get/u, /where is/u, /reading room/u, /contact/u,
];
const DEFINITION = [/что так(ое|ой|ая)/u, /что значит/u, /что означает/u, /что это/u, /как (читать|понять|расшифровать)/u, /деген (не|қалай)/u, /дегеніміз/u, /не үшін/u, /what (is|are|does)/u, /meaning of/u, /how (do i|to) read/u, /define/u];
const TERM_WORDS: Array<[Term, RegExp, Section[]]> = [
  ['archiveCode', /шифр|archive code|reference code|мұрағаттық шифр/u, ['catalog']],
  ['inventory', /опис[ьи]|тізбе|inventory/u, ['catalog']],
  ['case', /(?<!\p{L})(дело|дела|іс)(?!\p{L})|единиц\S* хранени|storage unit|\bfile\b/u, ['catalog']],
  ['sheet', /(?<!\p{L})лист|парақ|folio/u, ['catalog']],
  ['fond', /фонд|(?<!\p{L})қор(?!\p{L})|\bfonds?\b/u, ['catalog']],
  ['restricted', /ограничен|закрыт|шектеул|жабық|restricted|closed/u, ['catalog', 'visitors']],
  ['readingRoom', /читальн|оқу зал|reading room/u, ['visitors', 'branches']],
  ['digitalCopy', /цифров\S* коп|электронн\S* коп|скан|цифрлық көшірме|digital copy|scan/u, ['catalog']],
];
const NAV: Array<[Section, RegExp]> = [
  ['exhibitions', /выставк|экспозиц|көрме|exhibition/u],
  ['news', /новост|событи|мероприяти|жаңалық|іс-шара|\bnews\b|\bevents?\b/u],
  ['accessibility', /слабовидящ|доступност|крупн\S* шрифт|контраст|қолжетімділік|көру қабілеті|accessib|large text|contrast/u],
  ['history', /цифров\S* истори|истори\S* регион|память|тарих|history of the region|digital history/u],
  ['faq', /частые вопрос|вопросы и ответы|жиі қойылатын|faq/u],
  ['about', /об архиве|о архиве|истори\S* архива|руководств|мұрағат туралы|about the archive/u],
];

export function classifyIntent(text: string, parsed: ParsedQuery): Intent {
  if (has(text, SERVICE)) return { kind: 'service_request' };
  if (has(text, DEFINITION)) {
    const term = TERM_WORDS.find(([, re]) => re.test(text));
    if (term) return { kind: 'term', term: term[0], links: term[2] };
  }
  if (has(text, BRANCH)) return { kind: 'branch' };
  const filters = parsed.type.length + parsed.settlement.length + parsed.topic.length + (parsed.yearFrom === undefined ? 0 : 1);
  if (filters === 0) {
    const nav = NAV.find(([, re]) => re.test(text));
    if (nav) return { kind: 'navigation', section: nav[0] };
  }
  if (filters > 0 || parsed.keywords) return { kind: 'search' };
  return { kind: 'unknown' };
}
