import { ARCHIVE_CALENDAR, type CalendarEntry } from './archive-calendar.ts';

/**
 * Исторические личности (ТЗ §5.6, F-086) из «Календаря памятных дат», переданного архивом 10.11.2026.
 * Сведения о человеке — только записи календаря о нём, тексты без правки; годы жизни — только если они есть
 * в календаре. Биографии нет до передачи текстов архивом. Перевода на английский нет.
 */
export interface PersonSeed {
  slug: string;
  name: { ru: string; kk: string };
  birthYear: number | null;
  deathYear: number | null;
  /** Фрагменты русского текста записей календаря, по которым находятся записи об этом человеке. */
  match: string[];
}

export const ARCHIVE_PERSONS: PersonSeed[] = [
  { slug: 'auezov-mukhtar', name: { ru: 'Ауэзов Мухтар Омарханович', kk: 'Мұхтар Омарханұлы Әуезов' }, birthYear: null, deathYear: null, match: ['Ауэзова Мухтара'] },
  { slug: 'burov-pavel', name: { ru: 'Буров Павел Петрович', kk: 'Павел Петрович Буров' }, birthYear: 1902, deathYear: 1944, match: ['Павла Петровича Бурова'] },
  { slug: 'gerasimov-boris', name: { ru: 'Герасимов Борис Георгиевич', kk: 'Борис Георгиевич Герасимов' }, birthYear: 1872, deathYear: 1938, match: ['Герасимова Бориса'] },
  { slug: 'grebenshchikov-georgy', name: { ru: 'Гребенщиков Георгий Дмитриевич', kk: 'Георгий Дмитриевич Гребенщиков' }, birthYear: null, deathYear: null, match: ['Гребенщикова Георгия'] },
  { slug: 'nukayev-turgazy', name: { ru: 'Нукаев Тургазы', kk: 'Тұрғазы Нұқаев' }, birthYear: 1937, deathYear: 2001, match: ['Тургазы Нукаева'] },
  { slug: 'pankratyev-dmitry', name: { ru: 'Панкратьев Дмитрий Гордеевич', kk: 'Дмитрий Гордеевич Панкратьев' }, birthYear: 1867, deathYear: 1956, match: ['Дмитрия Гордеевича Панкратьева', 'Панкратьева Дмитрия Гордеевича'] },
  { slug: 'kharlamov-prokofy', name: { ru: 'Харламов Прокофий Григорьевич', kk: 'Прокофий Григорьевич Харламов' }, birthYear: null, deathYear: null, match: ['Харламова Прокофия'] },
  { slug: 'chistyakov-mikhail', name: { ru: 'Чистяков Михаил Иванович', kk: 'Михаил Иванович Чистяков' }, birthYear: null, deathYear: null, match: ['Чистякова Михаила'] },
];

/** Записи календаря о человеке. Нет записей — ошибка сида, а не пустая страница. */
export function personEntries(p: PersonSeed): CalendarEntry[] {
  const entries = ARCHIVE_CALENDAR.filter((e) => p.match.some((m) => e.ru.text.includes(m)));
  if (entries.length === 0) throw new Error(`Личности: нет записей календаря для ${p.slug}`);
  return entries;
}
