import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';

export interface Crumb { label: string; to?: string }

/**
 * Навигационная цепочка (дополнение к ТЗ §2; F-006). Первый пункт — главная, последний — текущая страница
 * без ссылки, с aria-current. Разделители скрыты от экранного диктора.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const all: Crumb[] = [{ label: t('nav.home'), to: `/${lang}` }, ...items];
  return (
    <nav aria-label={t('breadcrumbs.label')} className="mb-3 text-sm">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={`${i}-${c.label}`} className="flex min-w-0 items-center gap-2">
              {i > 0 ? <span aria-hidden="true" className="text-muted">/</span> : null}
              {last || !c.to ? <span aria-current={last ? 'page' : undefined} className="wrap-anywhere">{c.label}</span> : <Link to={c.to} className="wrap-anywhere">{c.label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Цепочки для страниц разделов: путь без языка → пункты (ключ перевода и адрес родителя).
 * Страницы с названием из данных (документ, фонд, филиал, выставка, публикация, новость) строят цепочку сами.
 */
const STATIC: Record<string, Array<[string, string?]>> = {
  about: [['nav.about']],
  'about/structure': [['nav.about', 'about'], ['about.structureTitle']],
  catalog: [['nav.catalog']],
  'catalog/fonds': [['nav.catalog', 'catalog'], ['fonds.title']],
  visitors: [['nav.visitors']],
  services: [['nav.services']],
  'services/paid': [['nav.services', 'services'], ['reference.nav.paid']],
  legislation: [['reference.nav.legislation']],
  'reading-room': [['nav.visitors', 'visitors'], ['reference.nav.reading-room']],
  symbols: [['reference.nav.symbols']],
  links: [['reference.nav.links']],
  history: [['nav.history']],
  calendar: [['nav.history', 'history'], ['calendar.title']],
  exhibitions: [['nav.exhibitions']],
  news: [['nav.news']],
  branches: [['nav.branches']],
  faq: [['nav.faq']],
  assistant: [['nav.assistant']],
  anticorruption: [['anticorruption.title']],
  feedback: [['nav.feedback']],
  accessibility: [['nav.accessibility']],
  search: [['search.title']],
};

export function SectionBreadcrumbs() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const { pathname } = useLocation();
  const path = pathname.split('/').filter(Boolean).slice(1).join('/');
  const items = STATIC[path];
  if (!items) return null;
  return <Breadcrumbs items={items.map(([key, to]) => ({ label: t(key), ...(to ? { to: `/${lang}/${to}` } : {}) }))} />;
}
