import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SemanticResult } from '../../lib/types.ts';
import { useApi } from '../../lib/useApi.ts';
import { DocumentCard } from './DocumentCard.tsx';

/**
 * «Похожие по смыслу» (D-023): дополнение к обычной выдаче от локальной модели ИИ.
 * Если модель не подключена, не ответила или ничего не нашла, блок не показывается вовсе:
 * посетитель видит обычный поиск без сообщений об ошибке. Документы из основной выдачи не повторяются.
 */
export function SemanticResults({ lang, q, exclude }: { lang: string; q: string; exclude: ReadonlySet<string> }) {
  const { t } = useTranslation();
  const query = q.trim();
  const result = useApi<SemanticResult>(query.length >= 2 ? `/catalog/semantic?${new URLSearchParams({ q: query, lang }).toString()}` : null);
  if (result.status !== 'ready' || !result.data.available) return null;
  const items = result.data.items.filter((d) => !exclude.has(d.id));
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="catalog-semantic" className="mb-6 rounded-md border-2 border-dashed border-border p-4">
      <h3 id="catalog-semantic" className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Sparkles aria-hidden="true" className="size-5 shrink-0" />
        {t('catalog.semantic.title')}
      </h3>
      <p className="mb-3 text-sm text-muted">{t('catalog.semantic.note')}</p>
      <ul className="grid gap-3">
        {items.map((d) => (
          <li key={d.id}>
            <DocumentCard lang={lang} doc={d} />
          </li>
        ))}
      </ul>
    </section>
  );
}
