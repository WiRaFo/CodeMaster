import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogQuery, MultiFilter } from '../../lib/catalog-query.ts';
import { toggleValue } from '../../lib/catalog-query.ts';
import type { CatalogFacets, FacetValue } from '../../lib/types.ts';

/**
 * Панель фильтров каталога (F-031, F-034). Одна и та же панель выводится в боковой колонке на широком экране
 * и в диалоге на мобильном; idPrefix разводит id полей. Каждый фильтр применяется сразу и меняет адрес страницы.
 */
export function CatalogFilters({ query, facets, onChange, idPrefix }: {
  query: CatalogQuery;
  facets: CatalogFacets | null;
  onChange: (next: CatalogQuery) => void;
  idPrefix: string;
}) {
  const { t } = useTranslation();

  const groups: Array<{ key: MultiFilter; values: FacetValue[] }> = facets
    ? [
        { key: 'branch', values: facets.branches },
        { key: 'type', values: facets.types },
        { key: 'period', values: facets.periods },
        { key: 'settlement', values: facets.settlements },
        { key: 'topic', values: facets.topics },
        { key: 'organization', values: facets.organizations ?? [] },
        {
          key: 'access',
          values: facets.access.map((a) => ({ value: a.value, name: t(`catalog.accessValue.${a.value}`), count: a.count })),
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <YearRange key={`${query.yearFrom}-${query.yearTo}`} query={query} onChange={onChange} idPrefix={idPrefix} />
      <AuthorFilter key={query.author} query={query} onChange={onChange} idPrefix={idPrefix} />

      <fieldset className="flt flt-list">
        <legend className="flt-legend">{t('catalog.filter.copyGroup')}</legend>
        <div className="flt-items">
          <label className="frow">
            <input type="checkbox" checked={query.hasDigitalCopy}
              onChange={() => onChange({ ...query, hasDigitalCopy: !query.hasDigitalCopy, page: 1 })} />
            <span className="flex-1">{t('catalog.filter.hasDigitalCopy')}</span>
            {facets ? <span className="frow-n">{facets.hasDigitalCopy.true}</span> : null}
          </label>
        </div>
      </fieldset>

      {groups.map(({ key, values }) => {
        const selected = query.multi[key];
        // Выбранное значение показываем, даже если по остальным фильтрам документов с ним нет, чтобы его можно было снять.
        const known = new Set(values.map(valueOf));
        const items = [...values, ...selected.filter((v) => !known.has(v)).map((v) => ({ value: v, name: v, count: 0 }))];
        if (items.length === 0) return null;
        return (
          <fieldset key={key} className="flt flt-list">
            <legend className="flt-legend">{t(`catalog.filter.${key}`)}</legend>
            <ul className="flt-items">
              {items.map((item) => {
                const value = valueOf(item);
                const id = `${idPrefix}-${key}-${value}`;
                return (
                  <li key={value}>
                    <label htmlFor={id} className="frow">
                      <input id={id} type="checkbox" checked={selected.includes(value)} onChange={() => onChange(toggleValue(query, key, value))} />
                      <span className="min-w-0 flex-1">{item.name ?? value}</span>
                      <span className="frow-n">{item.count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </div>
  );
}

const valueOf = (item: FacetValue): string => item.slug ?? item.code ?? item.value ?? '';

/** Автор или составитель: часть имени, без учёта регистра. Пустое поле снимает фильтр. */
function AuthorFilter({ query, onChange, idPrefix }: { query: CatalogQuery; onChange: (next: CatalogQuery) => void; idPrefix: string }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(query.author);
  const id = `${idPrefix}-author`;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange({ ...query, author: value.trim().slice(0, 200), page: 1 });
  };
  return (
    <form onSubmit={onSubmit} noValidate className="flt">
      <label htmlFor={id} className="flt-legend block">{t('catalog.filter.author')}</label>
      <div className="flex gap-2.5">
        <input id={id} className="flt-input min-w-0 flex-1" maxLength={200} value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={`${id}-hint`} />
        <button type="submit" className="flt-apply">{t('catalog.filter.apply')}</button>
      </div>
      <p id={`${id}-hint`} className="muted mt-2 mb-0 text-[calc(15px*var(--fs,1))]">{t('catalog.filter.authorHint')}</p>
    </form>
  );
}

function YearRange({ query, onChange, idPrefix }: { query: CatalogQuery; onChange: (next: CatalogQuery) => void; idPrefix: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(query.yearFrom?.toString() ?? '');
  const [to, setTo] = useState(query.yearTo?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parse = (v: string) => (v.trim() === '' ? null : Number(v));
    const yearFrom = parse(from);
    const yearTo = parse(to);
    const bad = (y: number | null) => y !== null && (!Number.isInteger(y) || y < 1000 || y > 2100);
    if (bad(yearFrom) || bad(yearTo)) return setError(t('catalog.filter.yearInvalid'));
    if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) return setError(t('catalog.filter.yearOrder'));
    setError(null);
    onChange({ ...query, yearFrom, yearTo, page: 1 });
  };

  const errorId = `${idPrefix}-years-error`;
  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset className="flt">
        <legend className="flt-legend">{t('catalog.filter.years')}</legend>
        <div className="flex items-end gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-year-from`} className="text-[calc(16px*var(--fs,1))]">{t('catalog.filter.yearFrom')}</label>
            <input id={`${idPrefix}-year-from`} className="flt-input w-full" inputMode="numeric" maxLength={4} value={from}
              onChange={(e) => setFrom(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-year-to`} className="text-[calc(16px*var(--fs,1))]">{t('catalog.filter.yearTo')}</label>
            <input id={`${idPrefix}-year-to`} className="flt-input w-full" inputMode="numeric" maxLength={4} value={to}
              onChange={(e) => setTo(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
          </div>
        </div>
        <button type="submit" className="flt-apply mt-3">{t('catalog.filter.apply')}</button>
        {error ? <p id={errorId} role="alert" className="mt-2 text-danger">{error}</p> : null}
      </fieldset>
    </form>
  );
}
