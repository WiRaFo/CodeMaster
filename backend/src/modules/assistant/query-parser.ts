/**
 * Разбор свободного запроса правилами (ТЗ §5.8 Б, с. 10; F-123, F-124). Без LLM: каждый распознанный
 * фрагмент становится фильтром каталога, который виден пользователю и который можно снять.
 * Пример ТЗ: «фотографии Усть-Каменогорска 1960-х» → тип «фото», населённый пункт, 1960–1969.
 */

export interface SettlementDictEntry {
  slug: string;
  /** Все названия: текущие на трёх языках и исторические. */
  names: string[];
}

export type Recognized =
  | { kind: 'type'; value: string; text: string }
  | { kind: 'settlement'; value: string; text: string }
  | { kind: 'years'; yearFrom: number; yearTo: number; text: string }
  | { kind: 'topic'; value: string; text: string };

export interface ParsedQuery {
  type: string[];
  settlement: string[];
  topic: string[];
  yearFrom?: number;
  yearTo?: number;
  /** Оставшиеся значимые слова — полнотекстовый запрос. */
  keywords: string;
  recognized: Recognized[];
}

/** Нормализация: нижний регистр, ё → е, тире и дефисы к одному виду, лишние пробелы. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[‐-―−]/g, '-')
    .replace(/[«»"“”„()?!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Основы слов: совпадение с началом слова. Порядок важен — первое совпадение побеждает. */
const TYPE_STEMS: Array<[string, string[]]> = [
  ['photo', ['фото', 'фотограф', 'снимк', 'снимок', 'фотосурет', 'сурет', 'photo', 'picture']],
  ['audio_video', ['видео', 'аудио', 'фильм', 'кинохроник', 'кинодокумент', 'бейне', 'video', 'audio', 'film', 'footage']],
  ['map_drawing', ['карта ', 'карты ', 'карту ', 'карт ', 'картами ', 'картах ', 'карте ', 'чертеж', 'план-схем', 'сызба', 'карталар', 'map', 'maps', 'drawing', 'blueprint']],
  ['personal_record', ['личного происхождения', 'личные документы', 'жеке тектік', 'personal papers']],
];

const TOPIC_STEMS: Array<[string, string[]]> = [
  ['industry', ['завод', 'фабрик', 'комбинат', 'предприят', 'промышлен', 'өнеркәсіп', 'кәсіпорын', 'зауыт', 'industr', 'factory', 'factories', 'plant ']],
  ['education_science', ['школ', 'образован', 'наук', 'университет', 'институт', 'мектеп', 'білім', 'ғылым', 'school', 'educat', 'science', 'university']],
  ['culture_art', ['культур', 'искусств', 'театр', 'музей', 'музык', 'мәдениет', 'өнер', 'culture', 'cultural', 'art ', 'arts', 'theatre', 'theater', 'museum']],
  ['great_patriotic_war', ['великой отечественн', 'великая отечественн', 'ұлы отан', 'фронтов', 'great patriotic']],
  ['people', ['известн', 'знаменит', 'личност', 'биограф', 'тұлға', 'famous', 'biograph', 'notable']],
  ['family', ['семь', 'семейн', 'родослов', 'генеалог', 'отбасы', 'ұрпақ', 'family', 'genealog', 'ancestr']],
];

/** Служебные и общие слова, которые не несут смысла для поиска. */
const STOPWORDS = new Set(
  (
    'найди найти найдите покажи покажите показать ищу нужны нужен нужна нужно хочу посмотреть есть ли какие какой какая где мне все всё ' +
    'документ документы документов материал материалы материалов архив архива архиве о об про по в во на с со и или за до из от к для ' +
    'годы годов год года году гг г лет годах период периода время времен времени век века ' +
    'табу тап тауып көрсет көрсетіңіз көрсетші маған керек бар ма қандай құжат құжаттар құжаттарды материалдар туралы бойынша және мен ' +
    'жыл жылы жылдар жылдары жылдардағы жж ғасыр мұрағат ' +
    'find show me please search look for i need want documents document records record materials about of in on the from to and or ' +
    'years year decade s archive any some with'
  ).split(' '),
);

const RU_DECADE_SUFFIX = '(?:-?(?:е|х|ые|ых|ым|ми)|s|\'s|(?:-?(?:шы|ші|ы|і))?\\s*-?(?:жж|жылдар\\S*))?';

interface YearHit {
  from: number;
  to: number;
  text: string;
}

function findYears(text: string): YearHit | null {
  // Диапазон: «1941-1945», «1941 - 1945», «с 1950 по 1960», «1950 to 1960».
  const range = /(?:^|\s)(?:с\s+|from\s+)?(1[6-9]\d\d|20[0-2]\d)\s*(?:-|по|до|to|until)\s*(1[6-9]\d\d|20[0-2]\d)(?:\s*(?:гг|годы|годов|жж|жылдар\S*))?/u.exec(text);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a <= b) return { from: a, to: b, text: range[0].trim() };
  }
  // Десятилетие: «1960-х», «1960-е», «1960s», «1960 жылдары», «60-х годов».
  const decade = new RegExp(`(?:^|\\s)(1[6-9]\\d0|20[0-2]0)${RU_DECADE_SUFFIX}(?=\\s|$)`, 'u').exec(text);
  if (decade && /(?:-?(?:е|х|ые|ых|ым|ми)|s|'s|жж|жылдар)/u.test(decade[0].replace(decade[1] ?? '', ''))) {
    const y = Number(decade[1]);
    return { from: y, to: y + 9, text: decade[0].trim() };
  }
  const shortDecade = /(?:^|\s)([2-9]0)-?(?:е|х|ые|ых)\s+(?:годов|годы|гг)/u.exec(text);
  if (shortDecade) {
    const y = 1900 + Number(shortDecade[1]);
    return { from: y, to: y + 9, text: shortDecade[0].trim() };
  }
  // Годы войны.
  const war = /(?:годы (?:великой отечественной )?войны|военные годы|войн[аы] 1941|соғыс жылдары|war years|world war ii|wwii|second world war|вов)/u.exec(text);
  if (war) return { from: 1941, to: 1945, text: war[0] };
  // Век: «XIX век», «19 век», «19th century», «XX ғасыр».
  const roman: Record<string, number> = { xvii: 17, xviii: 18, xix: 19, xx: 20, xxi: 21 };
  const century = /(?:^|\s)(xvii|xviii|xix|xx|xxi|1[7-9]|2[01])(?:-?(?:й|го|th|st))?\s+(?:век\S*|ғасыр\S*|century)/u.exec(text);
  if (century) {
    const c = roman[century[1] ?? ''] ?? Number(century[1]);
    return { from: (c - 1) * 100 + 1, to: Math.min(c * 100, 2100), text: century[0].trim() };
  }
  // Один год: «1965 год», «в 1965», «1965».
  const single = /(?:^|\s)(1[6-9]\d\d|20[0-2]\d)(?:\s*(?:год\S*|г|жыл\S*|year))?(?=\s|$)/u.exec(text);
  if (single) {
    const y = Number(single[1]);
    return { from: y, to: y, text: single[0].trim() };
  }
  return null;
}

/**
 * Падежные окончания после основы названия: русские («Усть-Каменогорска», «Семее», «Риддере») и казахские
 * («Өскеменнің», «Семейде», «Риддерге»). Прилагательные и другие слова с той же основой
 * («семейные») не совпадают: остаток слова должен быть окончанием из списка.
 */
const CASE_ENDING =
  /^(?:|а|я|е|у|ю|ом|ем|ой|ей|ы|и|ах|ях|й|'s|ның|нің|дың|дің|тың|тің|ға|ге|қа|ке|на|не|да|де|та|те|нда|нде|дан|ден|тан|тен|нан|нен|ды|ді|ты|ті|ны|ні|мен|бен|пен|дағы|дегі|тағы|тегі|ндағы|ндегі|ға|ге)$/u;

function findSettlements(text: string, dict: SettlementDictEntry[]): Array<{ slug: string; text: string }> {
  const words = text.split(' ');
  const hits: Array<{ slug: string; text: string }> = [];
  for (const s of dict) {
    found: for (const raw of s.names) {
      const name = normalize(raw);
      if (name.length < 3) continue;
      const parts = name.split(' ');
      // Основа: без конечной гласной, «й» или «ь» (Семей → семе, Алтай → алта).
      const last = parts[parts.length - 1] ?? '';
      const base = last.replace(/[аяеыйьиоуюі]$/u, '');
      for (let i = 0; i + parts.length <= words.length; i++) {
        const head = words.slice(i, i + parts.length - 1);
        const tail = words[i + parts.length - 1] ?? '';
        if (head.join(' ') !== parts.slice(0, -1).join(' ')) continue;
        const ending = (stem: string) => tail.startsWith(stem) && CASE_ENDING.test(tail.slice(stem.length).replace(/^-/, ''));
        if (ending(last) || ending(base)) {
          hits.push({ slug: s.slug, text: [...head, tail].join(' ') });
          break found;
        }
      }
    }
  }
  return hits;
}

function findStems(text: string, table: Array<[string, string[]]>): Array<{ value: string; text: string }> {
  const padded = ` ${text} `;
  const hits: Array<{ value: string; text: string }> = [];
  for (const [value, stems] of table) {
    for (const stem of stems) {
      // Основа с пробелом в конце («карт ») — целое слово, иначе — начало слова («карточка» не карта).
      const at = padded.indexOf(` ${stem}`);
      if (at >= 0) {
        const word = padded.slice(at + 1).split(' ').slice(0, stem.trim().split(' ').length).join(' ');
        hits.push({ value, text: word });
        break;
      }
    }
  }
  return hits;
}

export function parseQuery(input: string, settlements: SettlementDictEntry[]): ParsedQuery {
  let text = normalize(input);
  const recognized: Recognized[] = [];
  const consume = (fragment: string) => {
    text = ` ${text} `.replace(` ${fragment} `, ' ').replace(/\s+/g, ' ').trim();
  };

  const years = findYears(text);
  if (years) {
    recognized.push({ kind: 'years', yearFrom: years.from, yearTo: years.to, text: years.text });
    consume(years.text);
  }
  for (const s of findSettlements(text, settlements)) {
    recognized.push({ kind: 'settlement', value: s.slug, text: s.text });
    consume(s.text);
  }
  for (const t of findStems(text, TYPE_STEMS)) {
    recognized.push({ kind: 'type', value: t.value, text: t.text });
    consume(t.text);
  }
  for (const t of findStems(text, TOPIC_STEMS)) {
    // Тематика войны уже выражена годами — не сужаем выдачу дважды.
    if (t.value === 'great_patriotic_war' && years?.from === 1941) {
      consume(t.text);
      continue;
    }
    recognized.push({ kind: 'topic', value: t.value, text: t.text });
    consume(t.text);
  }

  const keywords = text
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .join(' ');
  const yearsHit = recognized.find((r): r is Extract<Recognized, { kind: 'years' }> => r.kind === 'years');
  return {
    type: recognized.flatMap((r) => (r.kind === 'type' ? [r.value] : [])),
    settlement: recognized.flatMap((r) => (r.kind === 'settlement' ? [r.value] : [])),
    topic: recognized.flatMap((r) => (r.kind === 'topic' ? [r.value] : [])),
    ...(yearsHit ? { yearFrom: yearsHit.yearFrom, yearTo: yearsHit.yearTo } : {}),
    keywords,
    recognized,
  };
}
