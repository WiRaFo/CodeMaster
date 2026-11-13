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
    <article className="card lift relative flex h-full flex-col gap-2.5 p-6 focus-within:border-[var(--brand)]">
      {meta ? <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{meta}</div> : null}
      <Heading className="text-[calc(21px*var(--fs,1))] font-extrabold leading-tight">
        <Link to={to} className="after:absolute after:inset-0 after:content-['']">{title}</Link>
      </Heading>
      {children}
    </article>
  );
}

/** Заголовок блока главной с необязательной ссылкой «Все …» справа. */
export function BlockHeading({ id, title, moreTo, moreLabel }: { id: string; title: string; moreTo?: string; moreLabel?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <h2 id={id} className="h2 u">{title}</h2>
      {moreTo && moreLabel ? <Link to={moreTo} className="btn ghost sm">{moreLabel}</Link> : null}
    </div>
  );
}
