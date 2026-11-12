import { createBrowserRouter, RouterProvider } from 'react-router';
import { A11yProvider } from './A11yProvider.tsx';
import { AnnouncerProvider } from './Announcer.tsx';
import { routes } from './routes.tsx';

const router = createBrowserRouter(routes);

export function App() {
  return (
    <A11yProvider>
      <AnnouncerProvider>
        <RouterProvider router={router} />
      </AnnouncerProvider>
    </A11yProvider>
  );
}
