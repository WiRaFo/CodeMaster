import { useTranslation } from 'react-i18next';
import { Link, Navigate, type RouteObject } from 'react-router';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { SECTIONS } from '../lib/sections.ts';
import { AccessibilityPage } from '../pages/AccessibilityPage.tsx';
import { AssistantPage } from '../pages/AssistantPage.tsx';
import { BranchPage } from '../pages/BranchPage.tsx';
import { BranchesPage } from '../pages/BranchesPage.tsx';
import { CatalogPage } from '../pages/CatalogPage.tsx';
import { DocumentPage } from '../pages/DocumentPage.tsx';
import { ExhibitionPage, ExhibitPage } from '../pages/ExhibitionPage.tsx';
import { ExhibitionsPage } from '../pages/ExhibitionsPage.tsx';
import { FaqPage } from '../pages/FaqPage.tsx';
import { FeedbackPage } from '../pages/FeedbackPage.tsx';
import { HistoryPage, PublicationPage } from '../pages/HistoryPage.tsx';
import { AboutPage, StructurePage, VisitorsPage } from '../pages/InfoPages.tsx';
import { CalendarPage } from '../pages/CalendarPage.tsx';
import { TimelinePage } from '../pages/TimelinePage.tsx';
import { PersonPage, PersonsPage } from '../pages/PersonPages.tsx';
import { AnticorruptionPage } from '../pages/AnticorruptionPage.tsx';
import { ReferencePage } from '../pages/ReferencePage.tsx';
import { CasePage, FondPage, FondsPage, InventoryPage } from '../pages/FondPages.tsx';
import { HomePage } from '../pages/HomePage.tsx';
import { NewsItemPage } from '../pages/NewsItemPage.tsx';
import { NewsListPage } from '../pages/NewsListPage.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';
import { SearchPage } from '../pages/SearchPage.tsx';
import { SectionStubPage } from '../pages/SectionStubPage.tsx';
import { LangLayout } from './LangLayout.tsx';
import { preferredLocale } from './preferred-locale.ts';

const IMPLEMENTED = new Set<string>(['catalog', 'news', 'exhibitions', 'branches', 'assistant', 'history', 'faq', 'visitors', 'about', 'services']);

/**
 * Сбой при отрисовке страницы: шапка и подвал остаются, вместо страницы — понятное сообщение,
 * а не служебный экран React Router.
 */
function RouteError() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeading title={t('common.loadError')} />
      <p><Link to="/">{t('notFound.toHome')}</Link></p>
    </>
  );
}

function RootRedirect() {
  return <Navigate to={`/${preferredLocale()}`} replace />;
}

export const routes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  // Панель управления — отдельный чанк, посетители сайта его не загружают (F-140).
  { path: '/admin/*', lazy: async () => ({ Component: (await import('../admin/AdminApp.tsx')).AdminApp }) },
  {
    path: '/:lang',
    element: <LangLayout />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'catalog', element: <CatalogPage /> },
          { path: 'news', element: <NewsListPage /> },
          { path: 'news/:slug', element: <NewsItemPage /> },
          // Карточки, которые появятся на следующих этапах: ссылки с главной уже ведут на постоянные адреса.
          { path: 'catalog/documents/:id', element: <DocumentPage /> },
          { path: 'catalog/fonds', element: <FondsPage /> },
          { path: 'catalog/fonds/:id', element: <FondPage /> },
          { path: 'catalog/inventories/:id', element: <InventoryPage /> },
          { path: 'catalog/cases/:id', element: <CasePage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'history/timeline', element: <TimelinePage /> },
          { path: 'history/persons', element: <PersonsPage /> },
          { path: 'history/persons/:slug', element: <PersonPage /> },
          { path: 'history/:slug', element: <PublicationPage /> },
          { path: 'exhibitions', element: <ExhibitionsPage /> },
          { path: 'exhibitions/:slug', element: <ExhibitionPage /> },
          { path: 'exhibitions/:slug/:number', element: <ExhibitPage /> },
          { path: 'branches', element: <BranchesPage /> },
          { path: 'branches/:slug', element: <BranchPage /> },
          { path: 'assistant', element: <AssistantPage /> },
          { path: 'faq', element: <FaqPage /> },
          { path: 'visitors', element: <VisitorsPage /> },
          { path: 'about', element: <AboutPage /> },
          { path: 'about/structure', element: <StructurePage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'anticorruption', element: <AnticorruptionPage /> },
          { path: 'services', element: <ReferencePage key="services" pageKey="services" /> },
          { path: 'services/paid', element: <ReferencePage key="services/paid" pageKey="services/paid" /> },
          { path: 'legislation', element: <ReferencePage key="legislation" pageKey="legislation" /> },
          { path: 'reading-room', element: <ReferencePage key="reading-room" pageKey="reading-room" /> },
          { path: 'symbols', element: <ReferencePage key="symbols" pageKey="symbols" /> },
          { path: 'links', element: <ReferencePage key="links" pageKey="links" /> },
          { path: 'feedback', element: <FeedbackPage /> },
          ...SECTIONS.filter((s) => s.path && !IMPLEMENTED.has(s.path)).map((s) => ({ path: s.path, element: <SectionStubPage section={s.key} /> })),
          { path: 'accessibility', element: <AccessibilityPage /> },
          { path: 'search', element: <SearchPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
