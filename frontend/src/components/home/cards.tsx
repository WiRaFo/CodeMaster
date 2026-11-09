import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Карточка-ссылка: вся карточка кликабельна, но в доступном имени только заголовок (ссылка внутри h3). */
export function LinkCard({ to, title, meta, children, headingLevel = 3 }: {
  to: string;
  title: string;
  meta?: ReactNode;
  children?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <article className="relative flex h-full flex-col gap-2 rounded-md border-2 border-border bg-surface p-4 focus-within:border-focus hover:border-primary">
      {meta ? <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{meta}</div> : null}
      <Heading className="text-lg font-semibold leading-snug">
        <Link to={to} className="after:absolute after:inset-0 after:content-['']">{title}</Link>
      </Heading>
      {children}
    </article>
  );
}

/** Заголовок блока главной с необязательной ссылкой «Все …» справа. */
export function BlockHeading({ id, title, moreTo, moreLabel }: { id: string; title: string; moreTo?: string; moreLabel?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="text-2xl font-bold">{title}</h2>
      {moreTo && moreLabel ? <Link to={moreTo} className="font-semibold">{moreLabel}</Link> : null}
    </div>
  );
}
