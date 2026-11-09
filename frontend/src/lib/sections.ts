/**
 * Разделы сайта в порядке ТЗ §4, с. 3. path — сегмент после языкового префикса.
 * Ключ перевода названия: nav.<key>.
 */
export const SECTIONS = [
  { key: 'home', path: '' },
  { key: 'about', path: 'about' },
  { key: 'catalog', path: 'catalog' },
  { key: 'visitors', path: 'visitors' },
  { key: 'history', path: 'history' },
  { key: 'exhibitions', path: 'exhibitions' },
  { key: 'news', path: 'news' },
  { key: 'branches', path: 'branches' },
  { key: 'faq', path: 'faq' },
  { key: 'assistant', path: 'assistant' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export const sectionHref = (lang: string, path: string): string => (path ? `/${lang}/${path}` : `/${lang}`);

/**
 * Официальные страницы архива в соцсетях (ТЗ §4, с. 4). Пусто, пока архив не подтвердил адреса:
 * не публикуем ссылки, найденные только на старом сайте.
 */
export const SOCIAL_LINKS: ReadonlyArray<{ name: string; url: string }> = [];
