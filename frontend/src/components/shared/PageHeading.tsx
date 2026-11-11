import type { ReactNode } from 'react';
import { usePageMeta, type PageMetaOptions } from '../../app/usePageMeta.ts';

/**
 * Единственный h1 страницы; tabIndex=-1 позволяет перевести на него фокус при смене маршрута.
 * Оформление по дизайну 11.11.2026:
 * - banner — тёмная плашка с розеткой орнамента (About, Catalog, Visitors…); справа печать или своя картинка (art);
 * - plain — крупный заголовок на светлом фоне (Document, News).
 * Внутри плашки токены цвета переопределены (.page-head), поэтому вложенные подписи и ссылки остаются контрастными.
 */
export function PageHeading({ title, id, children, meta, variant = 'banner', art, aside }: {
  title: string;
  id?: string;
  children?: ReactNode;
  meta?: PageMetaOptions;
  variant?: 'banner' | 'plain';
  /** Картинка справа вместо печати (декоративная); null — без картинки. */
  art?: ReactNode;
  /** Белая карточка справа в плашке (например, режим работы на «Посетителям»). */
  aside?: ReactNode;
}) {
  usePageMeta(title, meta);
  if (variant === 'plain') {
    return (
      <div className="page-plain">
        <h1 id={id} tabIndex={-1} className="h1 u in mb-[18px] focus:outline-none">{title}</h1>
        {children}
      </div>
    );
  }
  return (
    <div className="page-head dark mb-10">
      <div className="orn-ros spin page-head-ros" aria-hidden="true" />
      <div className="page-head-text">
        <h1 id={id} tabIndex={-1} className="h1 u in mb-[18px] focus:outline-none">{title}</h1>
        {children}
      </div>
      {aside ?? null}
      {aside ? null : art === undefined ? (
        <img className="seal floaty hide-m page-head-seal" src="/design/logo-seal-256.png" alt="" width={160} height={160} />
      ) : art}
    </div>
  );
}
