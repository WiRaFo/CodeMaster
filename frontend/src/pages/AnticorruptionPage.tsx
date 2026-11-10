import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { AnticorruptionInfo } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { HistoryBlockView } from './InfoPages.tsx';

const sizeLabel = (bytes: number, lang: string): string =>
  new Intl.NumberFormat(lang === 'kk' ? 'kk-KZ' : lang, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024);

/**
 * «Противодействие коррупции» (сведения архива 10.11.2026): информация комплаенс-службы, комплаенс-офицер,
 * документы PDF на русском и казахском. Сканы без текстового слоя помечаются: экранный диктор их не прочитает.
 */
export function AnticorruptionPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const info = useApi<AnticorruptionInfo>(`/anticorruption?lang=${lang}`);
  return (
    <>
      <PageHeading title={t('anticorruption.title')}>
        <p className="mt-2 max-w-3xl">{t('anticorruption.lead')}</p>
      </PageHeading>
      {info.status !== 'ready' ? <LoadStatus status={info.status} /> : (
        <>
          {info.data.officer ? (
            <section aria-labelledby="ac-officer" className="mb-8 max-w-3xl">
              <h2 id="ac-officer" className="mb-2 text-xl font-semibold">{t('anticorruption.officerTitle')}</h2>
              <p><span className="font-semibold">{info.data.officer.fullName}</span>, {info.data.officer.position}</p>
              <p className="mt-1 text-sm text-muted">{t('anticorruption.contact')}</p>
            </section>
          ) : null}
          <section aria-labelledby="ac-docs" className="mb-8 max-w-3xl">
            <h2 id="ac-docs" className="mb-3 text-xl font-semibold">{t('anticorruption.documentsTitle')}</h2>
            <ul className="flex flex-col gap-3">
              {info.data.documents.map((d) => (
                <li key={d.key} className="rounded-md border-2 border-border bg-surface p-3">
                  <p className="flex gap-2 font-semibold"><FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0" /><span>{d.title}</span></p>
                  <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                    {d.files.map((f) => (
                      <li key={f.locale}>
                        <a href={f.url} hrefLang={f.locale} type="application/pdf">
                          {t('anticorruption.file', { lang: t(`lang.${f.locale}`), pages: f.pages, size: sizeLabel(f.sizeBytes, lang) })}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {d.scanned ? <p className="mt-2 text-sm text-muted">{t('anticorruption.scanned')}</p> : null}
                </li>
              ))}
            </ul>
          </section>
          {info.data.text ? (
            <section aria-labelledby="ac-info" className="mb-8">
              <h2 id="ac-info" className="mb-2 text-xl font-semibold">{t('anticorruption.newsTitle')}</h2>
              <TranslationNote contentLang={info.data.text.contentLang} translationStatus={info.data.text.translationStatus} />
              <div className="mt-2 flex max-w-[75ch] flex-col gap-3" lang={info.data.text.contentLang}>
                {info.data.text.blocks.map((block, i) => <HistoryBlockView key={i} block={block} />)}
              </div>
            </section>
          ) : null}
          <p className="text-sm text-muted">{t('about.source')}</p>
        </>
      )}
    </>
  );
}
