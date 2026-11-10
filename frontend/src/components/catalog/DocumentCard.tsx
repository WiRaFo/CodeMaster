import { useTranslation } from 'react-i18next';
import { formatYears } from '../../lib/format.ts';
import type { DocumentSummary } from '../../lib/types.ts';
import { LinkCard } from '../home/cards.tsx';
import { OriginBadge, TranslationNote } from '../shared/OriginBadge.tsx';
import { Highlight } from './Highlight.tsx';

/** Карточка документа в выдаче каталога и в блоке «Похожие по смыслу». */
export function DocumentCard({ lang, doc }: { lang: string; doc: DocumentSummary }) {
  const { t } = useTranslation();
  return (
    <LinkCard
      to={`/${lang}/catalog/documents/${doc.id}`}
      title={doc.title ?? doc.archiveCode.formatted}
      meta={
        <>
          <span>{doc.archiveCode.formatted}</span>
          {doc.access === 'restricted' ? <span className="badge-warning">{t('catalog.restricted')}</span> : null}
          <OriginBadge origin={doc.dataOrigin} />
        </>
      }
    >
      <p className="text-sm text-muted">
        {[formatYears(doc.date), doc.type.name, doc.branch.name, doc.hasDigitalCopy ? t('home.digitalCopy') : null].filter(Boolean).join(' · ')}
      </p>
      {doc.highlight ? (
        <p className="text-sm">
          <Highlight html={doc.highlight} />
        </p>
      ) : null}
      <TranslationNote contentLang={doc.contentLang} translationStatus={doc.translationStatus} />
    </LinkCard>
  );
}
