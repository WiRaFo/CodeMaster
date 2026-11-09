import { Navigate, type RouteObject } from 'react-router';
import { SECTIONS } from '../lib/sections.ts';
import { AccessibilityPage } from '../pages/AccessibilityPage.tsx';
import { CatalogPage } from '../pages/CatalogPage.tsx';
import { DocumentPage } from '../pages/DocumentPage.tsx';
import { HomePage } from '../pages/HomePage.tsx';
import { NewsItemPage } from '../pages/NewsItemPage.tsx';
import { NewsListPage } from '../pages/NewsListPage.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';
import { SearchPage } from '../pages/SearchPage.tsx';
import { SectionStubPage } from '../pages/SectionStubPage.tsx';
import { LangLayout } from './LangLayout.tsx';
import { preferredLocale } from './preferred-locale.ts';

const IMPLEMENTED = new Set<string>(['catalog', 'news']);

function RootRedirect() {
  return <Navigate to={`/${preferredLocale()}`} replace />;
}

export const routes: RouteObject[] = [
  { path: '/', element: <RootRedirect /> },
  {
    path: '/:lang',
    element: <LangLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'news', element: <NewsListPage /> },
      { path: 'news/:slug', element: <NewsItemPage /> },
      // Карточки, которые появятся на следующих этапах: ссылки с главной уже ведут на постоянные адреса.
      { path: 'catalog/documents/:id', element: <DocumentPage /> },
      { path: 'history/:slug', element: <SectionStubPage section="history" /> },
      { path: 'exhibitions/:slug', element: <SectionStubPage section="exhibitions" /> },
      ...SECTIONS.filter((s) => s.path && !IMPLEMENTED.has(s.path)).map((s) => ({ path: s.path, element: <SectionStubPage section={s.key} /> })),
      { path: 'accessibility', element: <AccessibilityPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
