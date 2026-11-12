import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { CalendarList } from '../../pages/CalendarPage.tsx';
import type { CalendarData } from '../../lib/types.ts';
import { useApi } from '../../lib/useApi.ts';
import { TranslationNote } from '../shared/OriginBadge.tsx';
import { BlockHeading } from './cards.tsx';

/** Блок главной «Памятные даты месяца» из календаря архива; нет записей — блока нет. */
export function MonthDates() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const month = new Date().getMonth() + 1;
  const cal = useApi<CalendarData>(`/calendar?lang=${lang}&month=${month}`);
  if (cal.status !== 'ready' || cal.data.items.length === 0) return null;
  const items = cal.data.items.slice(0, 6);
  const first = items[0];
  return (
    <section aria-labelledby="home-calendar" className="mb-10">
      <BlockHeading
        id="home-calendar"
        title={t('calendar.homeTitle', { month: t(`calendar.month.${month}`), year: cal.data.year })}
        moreTo={`/${lang}/calendar`}
        moreLabel={t('calendar.all')}
      />
      {first ? <TranslationNote contentLang={first.contentLang} translationStatus={first.translationStatus} /> : null}
      <div className="mt-2 max-w-4xl"><CalendarList items={items} /></div>
    </section>
  );
}
