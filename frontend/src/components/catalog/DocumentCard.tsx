import { ImageIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatYears } from '../../lib/format.ts';
import type { DocumentSummary } from '../../lib/types.ts';
import { TranslationNote } from '../shared/OriginBadge.tsx';
import { Highlight } from './Highlight.tsx';

/** Цвета ярлыков-шифров по очереди (Catalog.dc.html): синий, тёмный, голубой. */
const TABS = [
  { bg: 'var(--brand)', fg: '#fff' },
  { bg: 'var(--ink)', fg: '#fff' },
  { bg: 'var(--tint2)', fg: 'var(--ink)' },
] as const;

/**
 * Карточка документа в выдаче каталога (дизайн 11.11.2026, Catalog.dc.html): ярлык с шифром как у папки,
 * объёмный лист слева (декоративный), метка доступа, заголовок-ссылка, год, вид и место хранения.
 */
export function DocumentCard({ lang, doc, index = 0 }: { lang: string; doc: DocumentSummary; index?: number }) {
  const { t } = useTranslation();
  const tab = TABS[index % TABS.length] ?? TABS[0];
  const style = { '--tab-bg': tab.bg, '--tab-fg': tab.fg, '--tab-x': `${(index % 3) * 18}px` } as CSSProperties;
  return (
    <article className="res" style={style}>
      <span className="res-tab mono">{doc.archiveCode.formatted}</span>
      <div className="res-body">
        <span className="doc3d-wrap hide-m" aria-hidden="true">
          <span className="doc3d">
            <span className="doc-page doc-page-3" />
            <span className="doc-page doc-page-2" />
            <span className="doc-page doc-page-1"><span /><span /><span /><span /></span>
          </span>
        </span>
        <div className="res-text">
          <div className="flex flex-wrap items-center gap-2">
            {doc.access === 'restricted'
              ? <span className="chip d">{t('catalog.restricted')}</span>
              : <span className="chip b">{t('catalog.accessValue.open')}</span>}
          </div>
          <h3 className="res-title">
            <Link to={`/${lang}/catalog/documents/${doc.id}`} className="after:absolute after:inset-0 after:content-['']">{doc.title ?? doc.archiveCode.formatted}</Link>
          </h3>
          <p className="m-0">{[formatYears(doc.date), doc.type.name, doc.branch.name].filter(Boolean).join(' · ')}</p>
          {doc.highlight ? <p className="m-0 text-[calc(17px*var(--fs,1))]"><Highlight html={doc.highlight} /></p> : null}
          {doc.hasDigitalCopy ? (
            <p className="res-copy"><ImageIcon aria-hidden="true" className="size-[22px]" />{t('catalog.filter.hasDigitalCopy')}</p>
          ) : null}
          <TranslationNote contentLang={doc.contentLang} translationStatus={doc.translationStatus} />
        </div>
      </div>
    </article>
  );
}
