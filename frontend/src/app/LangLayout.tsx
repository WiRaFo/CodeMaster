import { Suspense, lazy, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation, useParams } from 'react-router';
import { isLocale } from '../i18n/index.ts';
import { setLanguageLinks } from '../lib/head.ts';
import { writeStorage } from '../lib/storage.ts';
import { preferredLocale, LANG_STORAGE_KEY } from './preferred-locale.ts';
import { SkipLink } from '../components/accessibility/SkipLink.tsx';
import { Header } from '../components/layout/Header.tsx';
import { Footer } from '../components/layout/Footer.tsx';
import { SectionBreadcrumbs } from '../components/layout/Breadcrumbs.tsx';

/**
 * Адрес панели вида /admin/exhibitions/new совпадает с публичным /:lang/exhibitions/:slug (lang = «admin»),
 * и этот маршрут длиннее, чем /admin/*. Тогда панель открывается отсюда: её внутренние маршруты
 * считаются от /admin, как и при обычном входе через /admin/*.
 */
const AdminApp = lazy(async () => ({ default: (await import('../admin/AdminApp.tsx')).AdminApp }));

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
    if (valid) setLanguageLinks(window.location.origin, pathname);
  }, [valid, pathname]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const h1 = document.querySelector<HTMLElement>('#main h1');
    h1?.focus();
  }, [pathname]);

  if (lang === 'admin') {
    return (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  }
  if (!valid) return <Navigate to={`/${preferredLocale()}${pathname}${search}`} replace />;

  return (
    <>
      <SkipLink />
      <Header />
      {/* min-h-screen: пока страница загружает данные, подвал уже ниже первого экрана и не «прыгает» (CLS, ЭТАП 14). */}
      <main id="main" tabIndex={-1} className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 focus:outline-none">
        <SectionBreadcrumbs />
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
