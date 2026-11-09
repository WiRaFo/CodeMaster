import { Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';

/**
 * Поиск по архивному учёту (F-011). Отделён от поиска по сайту в шапке (F-007):
 * ведёт в /catalog?q=…, где запрос распознаётся и как слова, и как шифр.
 */
export function CatalogSearchForm({ id, initialQuery = '', large = false }: { id: string; initialQuery?: string; large?: boolean }) {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/${lang}/catalog?q=${encodeURIComponent(q)}` : `/${lang}/catalog`);
  };

  return (
    <form role="search" aria-label={t('catalogSearch.label')} onSubmit={onSubmit}>
      <label htmlFor={id} className={large ? 'mb-2 block text-lg font-semibold' : 'mb-2 block font-semibold'}>
        {t('catalogSearch.label')}
      </label>
      <div className="flex flex-wrap gap-2">
        <input id={id} type="search" name="q" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={200}
          aria-describedby={`${id}-hint`} className="input min-w-0 flex-1 basis-60" autoComplete="off" />
        <button type="submit" className="btn-primary">
          <Search aria-hidden="true" className="size-5" />
          <span>{t('catalogSearch.submit')}</span>
        </button>
      </div>
      <p id={`${id}-hint`} className="mt-2 text-sm text-muted">{t('catalogSearch.hint')}</p>
    </form>
  );
}
