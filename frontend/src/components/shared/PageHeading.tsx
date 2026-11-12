import type { ReactNode } from 'react';
import { usePageMeta } from '../../app/usePageMeta.ts';

/** Единственный h1 страницы; tabIndex=-1 позволяет перевести на него фокус при смене маршрута. */
export function PageHeading({ title, id, children }: { title: string; id?: string; children?: ReactNode }) {
  usePageMeta(title);
  return (
    <div className="mb-6">
      <h1 id={id} tabIndex={-1} className="text-3xl font-bold leading-tight focus:outline-none sm:text-4xl">{title}</h1>
      {children}
    </div>
  );
}
