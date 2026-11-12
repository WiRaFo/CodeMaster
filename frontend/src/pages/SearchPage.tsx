import { Archive, SearchX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CipherSearchInput } from '../components/catalog/CipherSearchInput.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { cleanCipher } from '../lib/cipher-input.ts';
import { formatDate } from '../lib/format.ts';
import type { SiteSearchGroupType, SiteSearchResult } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/** Разделы, у которых есть свой поиск: ссылка «Все результаты» ведёт туда с тем же запросом. */
const SECTION_SEARCH: Partial<Record<SiteSearchGroupType, string>> = { news: '/news', branches: '/branches' };

/**
 * Поиск по сайту из шапки (F-007, аудит Р3): результаты сгруппированы по разделам, запрос хранится в адресе.
 * Документы архива ищутся в каталоге: если запрос похож на шифр или находится в учёте, сверху карточка перехода в каталог.
 */
export function SearchPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = (params.get('q') ?? '').trim().slice(0, 200);
  const [draft, setDraft] = useState(q);
  const [shownFor, setShownFor] = useState(q);
  if (shownFor !== q) {
    setShownFor(q);
    setDraft(q);
  }
  const result = useApi<SiteSearchResult>(q ? `/search?${new URLSearchParams({ q, lang }).toString()}` : null);

  const codeOnly = result.status === 'ready' && result.data.catalogHint?.looksLikeCode === true && result.data.total === 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = cleanCipher(draft);
    void navigate(next ? `/${lang}/search?${new URLSearchParams({ q: next }).toString()}` : `/${lang}/search`);
  };

  return (
    <div className="ss-page">
      <PageHeading variant="plain" title={t('search.title')} meta={{ noindex: true }} />

      <form role="search" aria-label={t('search.label')} onSubmit={submit} className="field-row mb-3">
        <label htmlFor="ss-q" className="sr-only">{t('search.label')}</label>
        <CipherSearchInput id="ss-q" className="field" maxLength={200} value={draft} onValue={setDraft} placeholder={t('header.searchPlaceholder')} />
        <button type="submit" className="btn">{t('search.submit')}</button>
      </form>
      <p className="muted mb-[30px] max-w-[70ch]">{t('search.intro')}</p>

      {!q ? null : result.status !== 'ready' ? (
        <LoadStatus status={result.status} />
      ) : (
        <>
          {/* Шифр ищется только в каталоге: счётчик и пустая выдача по сайту тогда не показываются. */}
          {codeOnly ? <p role="status" className="sr-only">{t('search.catalog.code')}</p> : (
            <p role="status" className="mb-5 font-bold">{t('search.found', { count: result.data.total })}</p>
          )}

          {result.data.catalogHint ? (
            <aside className="ss-catalog" aria-labelledby="ss-catalog-title">
              <Archive aria-hidden="true" className="ss-catalog-icon" strokeWidth={1.6} />
              <div className="flex min-w-0 flex-col gap-2">
                <h2 id="ss-catalog-title" className="h3 m-0">{t('search.catalog.title')}</h2>
                {result.data.catalogHint.looksLikeCode ? <p className="m-0">{t('search.catalog.code')}</p> : null}
                <p className="m-0 font-bold">
                  {result.data.catalogHint.count > 0 ? t('search.catalog.found', { count: result.data.catalogHint.count }) : t('search.catalog.none')}
                </p>
              </div>
              <Link to={`/${lang}${result.data.catalogHint.path}`} className="btn self-center">{t('search.catalog.go')}</Link>
            </aside>
          ) : null}

          {codeOnly ? null : result.data.groups.length === 0 ? (
            <div className="card news-empty">
              <SearchX aria-hidden="true" className="size-14 text-[var(--brand)]" strokeWidth={1.6} />
              <p className="m-0 text-[calc(20px*var(--fs,1))] font-bold">{t('search.nothing')}</p>
            </div>
          ) : (
            result.data.groups.map((g) => {
              const section = SECTION_SEARCH[g.type];
              return (
                <section key={g.type} className="ss-group" aria-labelledby={`ss-${g.type}`}>
                  <h2 id={`ss-${g.type}`} className="ss-group-title">
                    {t(`search.groups.${g.type}`)} <span className="ss-count">{g.total}</span>
                  </h2>
                  <ul className="ss-list">
                    {g.items.map((item) => (
                      <li key={item.path + item.title} className="ss-item">
                        <Link to={`/${lang}${item.path}`} className="tlink ss-item-title">{item.title}</Link>
                        {item.date ? <time className="muted ss-date" dateTime={item.date}>{formatDate(item.date, lang)}</time> : null}
                        {item.excerpt ? <p className="ss-excerpt">{item.excerpt}</p> : null}
                      </li>
                    ))}
                  </ul>
                  {g.total > g.items.length ? (
                    <p className="ss-more">
                      <span className="muted">{t('search.shown', { shown: g.items.length, total: g.total })}</span>
                      {section ? (
                        <Link to={`/${lang}${section}?${new URLSearchParams({ q }).toString()}`} className="btn ghost sm">{t('search.more')}</Link>
                      ) : null}
                    </p>
                  ) : null}
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
