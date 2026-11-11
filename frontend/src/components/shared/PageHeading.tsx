import type { ReactNode } from 'react';
import { usePageMeta, type PageMetaOptions } from '../../app/usePageMeta.ts';

/**
 * Единственный h1 страницы; tabIndex=-1 позволяет перевести на него фокус при смене маршрута.
 * Оформление по дизайну 11.11.2026: тёмная плашка с розеткой орнамента и печатью (About.dc.html и др.).
 * Внутри плашки токены цвета переопределены (.page-head), поэтому вложенные подписи и ссылки остаются контрастными.
 */
export function PageHeading({ title, id, children, meta }: { title: string; id?: string; children?: ReactNode; meta?: PageMetaOptions }) {
  usePageMeta(title, meta);
  return (
    <div className="page-head dark mb-10">
      <div className="orn-ros spin page-head-ros" aria-hidden="true" />
      <div className="page-head-text">
        <h1 id={id} tabIndex={-1} className="h1 u in mb-[18px] focus:outline-none">{title}</h1>
        {children}
      </div>
      <img className="seal floaty hide-m page-head-seal" src="/design/logo-seal-256.png" alt="" width={160} height={160} />
    </div>
  );
}
