import { Navigate, type RouteObject } from 'react-router';
import { SECTIONS } from '../lib/sections.ts';
import { AccessibilityPage } from '../pages/AccessibilityPage.tsx';
import { HomePage } from '../pages/HomePage.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';
import { SearchPage } from '../pages/SearchPage.tsx';
import { SectionStubPage } from '../pages/SectionStubPage.tsx';
import { LangLayout } from './LangLayout.tsx';
import { preferredLocale } from './preferred-locale.ts';

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
      ...SECTIONS.filter((s) => s.path).map((s) => ({ path: s.path, element: <SectionStubPage section={s.key} /> })),
      { path: 'accessibility', element: <AccessibilityPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
