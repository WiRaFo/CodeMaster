import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import { isLocale } from '../i18n/index.ts';
import { writeStorage } from '../lib/storage.ts';
import { preferredLocale, LANG_STORAGE_KEY } from './preferred-locale.ts';
import { SkipLink } from '../components/accessibility/SkipLink.tsx';
import { Header } from '../components/layout/Header.tsx';
import { Footer } from '../components/layout/Footer.tsx';

/**
 * Каркас страницы с языковым префиксом /kk|ru|en (docs/architecture.md §7):
 * SkipLink → header → main#main → footer. При смене маршрута фокус переводится на h1 (accessibility.md §3).
 */
export function LangLayout() {
  const { lang } = useParams();
  const { pathname, search } = useLocation();
  const { i18n } = useTranslation();
  const firstRender = useRef(true);

  const valid = isLocale(lang);

  useEffect(() => {
    if (!valid) return;
    void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
    writeStorage(LANG_STORAGE_KEY, lang);
  }, [lang, valid, i18n]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const h1 = document.querySelector<HTMLElement>('#main h1');
    h1?.focus();
  }, [pathname]);

  if (!valid) return <Navigate to={`/${preferredLocale()}${pathname}${search}`} replace />;

  return (
    <>
      <SkipLink />
      <Header />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 focus:outline-none">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
