import * as Dialog from '@radix-ui/react-dialog';
import { Archive, BookOpen, Menu, Moon, Search, Sun, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import { useA11y } from '../../app/A11yProvider.tsx';
import { SECTIONS, sectionHref } from '../../lib/sections.ts';
import { A11yPanel } from '../accessibility/A11yPanel.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';

/**
 * Шапка по ТЗ §4, с. 3: логотип и официальное наименование, переключатель языков, переключатель темы,
 * поисковая строка, кнопка перехода к электронному каталогу; плюс кнопка панели доступности.
 */
export function Header() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const { theme, update } = useA11y();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const isDark = theme === 'dark';

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/${lang}/search?q=${encodeURIComponent(q)}` : `/${lang}/search`);
  };

  const navLinks = (onClick?: () => void) =>
    SECTIONS.map((s) => (
      <li key={s.key}>
        <NavLink to={sectionHref(lang, s.path)} end={s.path === ''} className="nav-link" onClick={onClick}>
          {t(`nav.${s.key}`)}
        </NavLink>
      </li>
    ));

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to={`/${lang}`} className="flex min-w-0 items-center gap-3 text-text no-underline" aria-label={t('site.homeLink')}>
          <Archive aria-hidden="true" className="size-10 shrink-0 text-primary" />
          <span className="flex min-w-0 flex-col">
            <span className="text-base font-bold leading-tight sm:text-lg">{t('site.name')}</span>
            <span className="text-sm text-muted">{t('site.tagline')}</span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageSwitcher />
          <button type="button" className="btn-icon" onClick={() => update({ scheme: isDark ? 'light' : 'dark' })}
            aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}>
            {isDark ? <Sun aria-hidden="true" className="size-5" /> : <Moon aria-hidden="true" className="size-5" />}
          </button>
          <A11yPanel />
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 pb-3">
        <form role="search" aria-label={t('header.searchLabel')} onSubmit={onSearch} className="flex min-w-0 flex-1 basis-64 gap-2">
          <label htmlFor="site-search" className="visually-hidden">{t('header.searchLabel')}</label>
          <input id="site-search" type="search" name="q" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t('header.searchPlaceholder')} maxLength={200} className="input min-w-0 flex-1" />
          <button type="submit" className="btn-primary">
            <Search aria-hidden="true" className="size-5" />
            <span>{t('header.searchSubmit')}</span>
          </button>
        </form>
        <Link to={`/${lang}/catalog`} className="btn-secondary no-underline">
          <BookOpen aria-hidden="true" className="size-5" />
          <span>{t('header.catalogButton')}</span>
        </Link>
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger className="btn-secondary lg:hidden">
            <Menu aria-hidden="true" className="size-5" />
            <span>{t('header.menuOpen')}</span>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-40 flex w-full max-w-sm flex-col gap-4 overflow-y-auto bg-surface p-5 text-text">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-xl font-bold">{t('header.menuTitle')}</Dialog.Title>
                <Dialog.Close className="btn-icon" aria-label={t('header.close')}>
                  <X aria-hidden="true" className="size-5" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="visually-hidden">{t('nav.label')}</Dialog.Description>
              <nav aria-label={t('nav.label')}>
                <ul className="flex flex-col gap-1">{navLinks(() => setMenuOpen(false))}</ul>
              </nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      <nav aria-label={t('nav.label')} className="hidden border-t border-border lg:block">
        <ul className="mx-auto flex max-w-7xl flex-wrap gap-x-1 px-4 py-1">{navLinks()}</ul>
      </nav>
    </header>
  );
}
