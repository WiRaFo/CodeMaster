import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Breadcrumbs } from '../components/layout/Breadcrumbs.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import { formatDate } from '../lib/format.ts';
import type { NewsItem } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

/** Новость. Текст выводится как обычный текст по абзацам; rich text из редактора — вместе с админкой. */
export function NewsItemPage() {
  const { t } = useTranslation();
  const { lang = 'kk', slug = '' } = useParams();
  const item = useApi<NewsItem>(`/news/${encodeURIComponent(slug)}?lang=${lang}`);

  if (item.status === 'error' && item.notFound) return <NotFoundPage />;
  if (item.status !== 'ready') return <LoadStatus status={item.status} />;
  const n = item.data;
  return (
    <article className="prose-page">
      <Breadcrumbs items={[{ label: t('nav.news'), to: `/${lang}/news` }, { label: n.title ?? slug }]} />
      <PageHeading title={n.title ?? slug} meta={{ description: n.lead ?? undefined }}>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-muted">
          <time dateTime={n.publishedAt}>{formatDate(n.publishedAt, lang)}</time>
          {n.rubric?.name ? <span>· {n.rubric.name}</span> : null}
          <OriginBadge origin={n.dataOrigin} />
        </p>
        <TranslationNote contentLang={n.contentLang} translationStatus={n.translationStatus} />
      </PageHeading>
      {n.lead ? <p className="text-lg font-semibold">{n.lead}</p> : null}
      {(n.bodyText ?? '').split(/\n{2,}/).filter(Boolean).map((para, i) => <p key={i}>{para}</p>)}
      {n.dataOrigin === 'demo' ? <p className="text-sm text-muted">{t('origin.demoNote')}</p> : null}
      <p>
        <Link to={`/${lang}/news`}>{t('news.back')}</Link>
      </p>
    </article>
  );
}
