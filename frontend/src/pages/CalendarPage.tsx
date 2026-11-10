import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { TranslationNote } from '../components/shared/OriginBadge.tsx';
import { PageHeading } from '../components/shared/PageHeading.tsx';
import type { CalendarData, CalendarItem } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/** Записи, сгруппированные по месяцам в порядке источника; без месяца — в конце. */
export function groupByMonth(items: CalendarItem[]): Array<[number | null, CalendarItem[]]> {
  const groups = new Map<number | null, CalendarItem[]>();
  for (const item of items) groups.set(item.month, [...(groups.get(item.month) ?? []), item]);
  return [...groups].sort(([a], [b]) => (a ?? 13) - (b ?? 13));
}

export function CalendarList({ items }: { items: CalendarItem[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((d) => (
        <li key={d.id} className="grid gap-x-4 sm:grid-cols-[9rem_minmax(0,1fr)]" lang={d.contentLang}>
          <span className="font-semibold">{d.dateLabel}</span>
          <span>{d.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * «Календарь памятных дат» области (сведения архива, 2022–2026): выбор года ссылками, записи по месяцам.
 * Тексты на русском и казахском; на английском показывается русский текст с пометкой языка.
 */
export function CalendarPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const [params] = useSearchParams();
  const year = params.get('year');
  const cal = useApi<CalendarData>(`/calendar?lang=${lang}${year && /^\d{4}$/.test(year) ? `&year=${year}` : ''}`);
  const first = cal.status === 'ready' ? cal.data.items[0] : undefined;
  return (
    <>
      <PageHeading title={t('calendar.title')}>
        <p className="mt-2 max-w-3xl">{t('calendar.lead')}</p>
      </PageHeading>
      {cal.status !== 'ready' ? <LoadStatus status={cal.status} /> : (
        <>
          <nav aria-label={t('calendar.years')} className="mb-6">
            <ul className="flex flex-wrap gap-2">
              {cal.data.years.map((y) => (
                <li key={y}>
                  <Link
                    to={`/${lang}/calendar?year=${y}`}
                    className={y === cal.data.year ? 'btn-primary' : 'btn-secondary'}
                    aria-current={y === cal.data.year ? 'page' : undefined}
                  >
                    {y}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {first ? <TranslationNote contentLang={first.contentLang} translationStatus={first.translationStatus} /> : null}
          {cal.data.items.length === 0 ? <p>{t('calendar.empty')}</p> : (
            <div className="mt-2 flex max-w-4xl flex-col gap-8">
              {groupByMonth(cal.data.items).map(([month, items]) => (
                <section key={month ?? 'year'} aria-labelledby={`month-${month ?? 'year'}`}>
                  <h2 id={`month-${month ?? 'year'}`} className="mb-3 text-xl font-semibold">
                    {month ? t(`calendar.month.${month}`) : t('calendar.undated')}
                  </h2>
                  <CalendarList items={items} />
                </section>
              ))}
            </div>
          )}
          <p className="mt-8 text-sm text-muted">{t('calendar.source')}</p>
        </>
      )}
    </>
  );
}
