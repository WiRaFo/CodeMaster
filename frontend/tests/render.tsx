import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { A11yProvider } from '../src/app/A11yProvider.tsx';
import { AnnouncerProvider } from '../src/app/Announcer.tsx';
import { routes } from '../src/app/routes.tsx';

export const MAIN_BRANCH = {
  name: 'Государственный архив Восточно-Казахстанской области',
  address: 'г. Усть-Каменогорск, ул. Головкова, 26/1',
  phone: '8 (7232) 25-59-76',
  email: 'arhiv-ukg@yandex.kz',
  scheduleText: 'Пн–пт, 9:00–18:00',
  readingRoomSchedule: 'Читальный зал: пн–пт, 10:00–17:00',
  needsVerification: true,
};

export function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <A11yProvider>
      <AnnouncerProvider>
        <RouterProvider router={router} />
      </AnnouncerProvider>
    </A11yProvider>,
  );
  return { ...utils, router };
}
