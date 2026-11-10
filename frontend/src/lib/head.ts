/**
 * Управление <head> для поисковых систем и превью ссылок (SEO, ЭТАП 13).
 * Сайт — SPA без серверной отрисовки: эти теги видят поисковики, исполняющие JavaScript.
 */
import { LOCALES } from '@archive-vko/shared/enums';

type MetaKey = { name: string } | { property: string };

function selector(key: MetaKey): string {
  return 'name' in key ? `meta[name="${key.name}"]` : `meta[property="${key.property}"]`;
}

/** Создаёт или обновляет <meta>; content = null удаляет тег. */
export function setMeta(key: MetaKey, content: string | null): void {
  const existing = document.head.querySelector<HTMLMetaElement>(selector(key));
  if (content === null) {
    existing?.remove();
    return;
  }
  const el = existing ?? document.createElement('meta');
  if ('name' in key) el.setAttribute('name', key.name);
  else el.setAttribute('property', key.property);
  el.setAttribute('content', content);
  if (!existing) document.head.appendChild(el);
}

/** Канонический адрес и языковые версии страницы: /{lang}/… → hreflang для kk, ru, en и x-default (kk). */
export function setLanguageLinks(origin: string, pathname: string): void {
  const rest = pathname.replace(/^\/(kk|ru|en)(?=\/|$)/, '');
  document.head.querySelectorAll('link[data-seo]').forEach((el) => el.remove());
  const add = (rel: string, href: string, hreflang?: string) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    if (hreflang) link.hreflang = hreflang;
    link.dataset['seo'] = '';
    document.head.appendChild(link);
  };
  add('canonical', `${origin}${pathname}`);
  for (const lang of LOCALES) add('alternate', `${origin}/${lang}${rest}`, lang);
  add('alternate', `${origin}/kk${rest}`, 'x-default');
}
