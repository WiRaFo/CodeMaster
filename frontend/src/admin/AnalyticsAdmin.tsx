import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { AdminHeading, ErrorMessage, useAuth } from './AdminApp.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { AdminApiError, adminRequest, errorText } from './api.ts';
import { ADMIN_LOCALES, formatDateTime, type AdminLocale } from './format.ts';
import { useAdminData } from './useAdminData.ts';

// ---------- Аналитика ----------

interface Count { key: string; views: number }
interface Query { text: string; source: string; count: number }
interface Analytics {
  days: number;
  totalViews: number;
  bySection: Count[];
  byLocale: Count[];
  byDay: Count[];
  queries: { total: number; zero: number };
  topQueries: Query[];
  zeroQueries: Query[];
  errors: Array<{ kind: string; path: string; count: number }>;
}

const SECTION: Record<string, string> = {
  home: 'Главная', catalog: 'Каталог: поиск', 'catalog/documents': 'Карточки документов', 'catalog/fonds': 'Фонды', 'catalog/inventories': 'Описи', 'catalog/cases': 'Дела',
  news: 'Новости', history: 'История', 'history/timeline': 'Хронология', 'history/persons': 'Персоналии', 'history/collections': 'Коллекции', 'history/gallery': 'Галерея',
  exhibitions: 'Выставки', branches: 'Филиалы', assistant: 'ИИ-помощник', faq: 'Вопросы и ответы', visitors: 'Посетителям', about: 'Об архиве', calendar: 'Памятные даты',
  anticorruption: 'Противодействие коррупции', services: 'Услуги', legislation: 'Законодательство', 'reading-room': 'Читальный зал', symbols: 'Символика', links: 'Ссылки',
  feedback: 'Обратная связь', accessibility: 'Доступность', search: 'Поиск по сайту', other: 'Другие страницы',
};
const LOCALE: Record<string, string> = { kk: 'Қазақша', ru: 'Русский', en: 'English' };
const SOURCE: Record<string, string> = { catalog: 'каталог', site: 'сайт', assistant: 'помощник' };
const ERROR: Record<string, string> = { not_found: 'Страница не найдена', load_failed: 'Сбой загрузки' };
const PERIODS = [7, 30, 90] as const;

/** Полосы: длина — доля от наибольшего значения, число всегда подписано текстом. */
function Bars({ title, rows, label }: { title: string; rows: Count[]; label: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.views));
  return (
    <section className="an-card" aria-labelledby={`an-${title}`}>
      <h2 id={`an-${title}`} className="mb-3 text-xl font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-muted">Данных пока нет.</p> : (
        <ul className="an-bars">
          {rows.map((r) => (
            <li key={r.key}>
              <span className="an-bar-l">{label(r.key)}</span>
              <span className="an-bar" aria-hidden="true"><span style={{ width: `${(r.views / max) * 100}%` }} /></span>
              <span className="an-bar-n">{r.views}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QueryTable({ title, rows, empty }: { title: string; rows: Query[]; empty: string }) {
  return (
    <section className="an-card" aria-labelledby={`an-${title}`}>
      <h2 id={`an-${title}`} className="mb-3 text-xl font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="text-muted">{empty}</p> : (
        <table className="admin-table w-full">
          <thead><tr><th scope="col">Запрос</th><th scope="col">Где</th><th scope="col">Раз</th></tr></thead>
          <tbody>
            {rows.map((q) => <tr key={`${q.source}-${q.text}`}><td>{q.text}</td><td>{SOURCE[q.source] ?? q.source}</td><td>{q.count}</td></tr>)}
          </tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Аналитика сайта (ТЗ §5.8 Д, с. 11; F-126, F-127): посещаемость разделов, языки, запросы без результата, ошибки.
 * Только обезличенные счётчики: без IP, cookies и идентификаторов посетителей (S-032).
 */
export function AnalyticsAdminPage() {
  const [params, setParams] = useSearchParams();
  const days = Number(params.get('days')) || 30;
  const data = useAdminData<Analytics>(`/admin/analytics?days=${days}`);
  const a = data.data;
  return (
    <>
      <AdminHeading title="Аналитика сайта" />
      <p className="mb-3 max-w-3xl">Обезличенные счётчики: какие разделы открывают, на каком языке, что ищут и где не находят. IP-адреса, cookies и данные посетителей не собираются; при включённом в браузере «Не отслеживать» визит не учитывается.</p>
      <div role="group" aria-label="Период" className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button key={p} type="button" className={p === days ? 'btn-primary' : 'btn-secondary'} aria-pressed={p === days} onClick={() => setParams({ days: String(p) })}>
            {p} дней
          </button>
        ))}
      </div>
      <ErrorMessage error={data.error} />
      {a ? (
        <>
          <dl className="an-kpi">
            <div><dt>Просмотров страниц</dt><dd>{a.totalViews}</dd></div>
            <div><dt>Поисковых запросов</dt><dd>{a.queries.total}</dd></div>
            <div><dt>Из них без результата</dt><dd>{a.queries.zero}{a.queries.total ? ` (${Math.round((a.queries.zero / a.queries.total) * 100)}%)` : ''}</dd></div>
            <div><dt>Ошибок</dt><dd>{a.errors.reduce((n, e) => n + e.count, 0)}</dd></div>
          </dl>
          <div className="an-grid">
            <Bars title="Разделы" rows={a.bySection} label={(k) => SECTION[k] ?? k} />
            <div className="flex flex-col gap-4">
              <Bars title="Языки" rows={a.byLocale} label={(k) => LOCALE[k] ?? k} />
              <Bars title="По дням" rows={a.byDay} label={(k) => k.split('-').reverse().slice(0, 2).join('.')} />
            </div>
            <QueryTable title="Частые запросы" rows={a.topQueries} empty="Запросов пока нет." />
            <QueryTable title="Запросы без результата" rows={a.zeroQueries} empty="Все запросы нашли ответ." />
            <section className="an-card" aria-labelledby="an-errors">
              <h2 id="an-errors" className="mb-3 text-xl font-semibold">Ошибки</h2>
              {a.errors.length === 0 ? <p className="text-muted">Ошибок не было.</p> : (
                <table className="admin-table w-full">
                  <thead><tr><th scope="col">Что</th><th scope="col">Адрес</th><th scope="col">Раз</th></tr></thead>
                  <tbody>{a.errors.map((e) => <tr key={`${e.kind}-${e.path}`}><td>{ERROR[e.kind] ?? e.kind}</td><td>{e.path}</td><td>{e.count}</td></tr>)}</tbody>
                </table>
              )}
            </section>
          </div>
          <p className="mt-4 text-sm text-muted">Почта и длинные номера в запросах заменяются на [email] и [number] ещё до записи.</p>
        </>
      ) : null}
    </>
  );
}

// ---------- База знаний помощника ----------

const LINKS: Record<string, string> = {
  services: 'Госуслуга', exhibitions: 'Выставки', news: 'Новости', history: 'История', accessibility: 'Доступность',
  faq: 'Вопросы и ответы', about: 'Об архиве', visitors: 'Посетителям', catalog: 'Каталог', branches: 'Филиалы и контакты',
};
interface Texts { question: string; keywords: string; answer: string }
interface Entry { id: string; published: boolean; links: string[]; updatedAt: string; translations: Partial<Record<AdminLocale, { question: string; keywords: string[]; answer: string }>> }
interface Form { published: boolean; links: string[]; texts: Record<AdminLocale, Texts> }
interface Unanswered { text: string; locale: string; count: number; lastAt: string | null }

const blank = (): Texts => ({ question: '', keywords: '', answer: '' });
const emptyForm = (question = '', locale: AdminLocale = 'ru'): Form => {
  const texts: Record<AdminLocale, Texts> = { ru: blank(), kk: blank(), en: blank() };
  texts[locale] = { ...texts[locale], question };
  return { published: true, links: [], texts };
};
const formOf = (e: Entry): Form => {
  const t = (l: AdminLocale): Texts => {
    const x = e.translations[l];
    return x ? { question: x.question, keywords: x.keywords.join(', '), answer: x.answer } : blank();
  };
  return { published: e.published, links: e.links, texts: { ru: t('ru'), kk: t('kk'), en: t('en') } };
};
const isAdminLocale = (v: string): v is AdminLocale => v === 'ru' || v === 'kk' || v === 'en';

/**
 * База знаний ИИ-помощника (ТЗ §5.8 А, с. 10): вопросы и ответы, которые ведут сотрудники.
 * Помощник отвечает записью, если в вопросе посетителя есть одна из её ключевых фраз (на любом языке).
 * Рядом — вопросы, на которые помощник не нашёл ответа: из них удобно делать новые записи.
 */
export function KnowledgeAdminPage() {
  const { can } = useAuth();
  const writable = can('pages:publish');
  const list = useAdminData<{ items: Entry[] }>('/admin/assistant/knowledge');
  const gaps = useAdminData<{ items: Unanswered[] }>('/admin/assistant/unanswered?days=90');
  const [editing, setEditing] = useState<{ id: string | null; updatedAt: string | null; form: Form } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);

  const setForm = (patch: Partial<Form>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const setText = (l: AdminLocale, k: keyof Texts, v: string) => editing && setForm({ texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    const f = editing.form;
    const translations = Object.fromEntries(ADMIN_LOCALES.filter((l) => f.texts[l.code].question.trim()).map((l) => {
      const t = f.texts[l.code];
      return [l.code, { question: t.question, answer: t.answer, keywords: t.keywords.split(/[,;\n]/).map((k) => k.trim()).filter(Boolean) }];
    }));
    try {
      await adminRequest(editing.id ? 'PUT' : 'POST', editing.id ? `/admin/assistant/knowledge/${editing.id}` : '/admin/assistant/knowledge',
        { published: f.published, links: f.links, translations }, editing.updatedAt ? { 'If-Match': editing.updatedAt } : {});
      setStatus(editing.id ? 'Ответ сохранён.' : 'Ответ добавлен.');
      setEditing(null);
      list.reload();
    } catch (e) {
      setError(e instanceof AdminApiError && e.code === 'VALIDATION_FAILED'
        ? 'Заполните на русском вопрос (от 5 символов), ключевые фразы (от 3 символов, через запятую) и ответ (от 10 символов). Для других языков — все три поля или ни одного.'
        : errorText(e));
    }
  };

  const remove = async (row: Entry) => {
    try {
      await adminRequest('DELETE', `/admin/assistant/knowledge/${row.id}`, { confirm: true });
      setStatus('Ответ удалён.');
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  const start = (form: Form, id: string | null = null, updatedAt: string | null = null) => {
    setStatus(null);
    setError(null);
    setEditing({ id, updatedAt, form });
    requestAnimationFrame(() => document.getElementById('kn-form')?.querySelector<HTMLElement>('input, textarea')?.focus());
  };

  return (
    <>
      <AdminHeading title="База знаний помощника">
        {writable && !editing ? <button type="button" className="btn-primary" onClick={() => start(emptyForm())}>Добавить ответ</button> : null}
      </AdminHeading>
      <p className="mb-3 max-w-3xl">Готовые ответы ИИ-помощника. Помощник выбирает запись, если в вопросе посетителя встречается одна из её ключевых фраз, и отвечает текстом на языке посетителя (или на русском, если перевода нет). Пишите фразы точно: «часы работы», а не «архив».</p>
      <p role="status" className="mb-2">{status}</p>
      <ErrorMessage error={list.error ?? (editing ? null : error)} />

      {editing ? (
        <form id="kn-form" aria-label={editing.id ? 'Правка ответа' : 'Новый ответ'} onSubmit={(e) => void save(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{editing.id ? 'Правка ответа' : 'Новый ответ'}</h2>
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="flex flex-col gap-2">
              <legend className="font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ''}</legend>
              <div className="admin-field">
                <label htmlFor={`kn-${l.code}-q`}>Вопрос</label>
                <input id={`kn-${l.code}-q`} className="input" lang={l.code} value={editing.form.texts[l.code].question} onChange={(e) => setText(l.code, 'question', e.target.value)} />
              </div>
              <div className="admin-field">
                <label htmlFor={`kn-${l.code}-k`}>Ключевые фразы через запятую</label>
                <input id={`kn-${l.code}-k`} className="input" lang={l.code} value={editing.form.texts[l.code].keywords} onChange={(e) => setText(l.code, 'keywords', e.target.value)} />
              </div>
              <div className="admin-field">
                <label htmlFor={`kn-${l.code}-a`}>Ответ</label>
                <textarea id={`kn-${l.code}-a`} className="input min-h-24" lang={l.code} value={editing.form.texts[l.code].answer} onChange={(e) => setText(l.code, 'answer', e.target.value)} />
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend className="font-semibold">Ссылки на разделы под ответом (до 4)</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {Object.entries(LINKS).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={editing.form.links.includes(k)} disabled={!editing.form.links.includes(k) && editing.form.links.length >= 4}
                    onChange={(e) => setForm({ links: e.target.checked ? [...editing.form.links, k] : editing.form.links.filter((x) => x !== k) })} />
                  {v}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={editing.form.published} onChange={(e) => setForm({ published: e.target.checked })} />
            Помощник использует этот ответ
          </label>
          <ErrorMessage error={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">Сохранить</button>
            <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setError(null); }}>Отмена</button>
          </div>
        </form>
      ) : null}

      <div className="an-grid">
        <section aria-labelledby="kn-list" className="an-card">
          <h2 id="kn-list" className="mb-3 text-xl font-semibold">Ответы ({list.data?.items.length ?? 0})</h2>
          {list.data && list.data.items.length === 0 ? <p className="text-muted">Записей пока нет.</p> : null}
          <ul className="flex flex-col gap-2">
            {list.data?.items.map((e) => (
              <li key={e.id} className="rounded-md border border-border p-3">
                <p className="font-semibold">{e.translations.ru?.question ?? e.id}</p>
                <p className="text-sm text-muted">
                  {e.published ? 'Используется' : 'Выключен'}. Языки: {ADMIN_LOCALES.filter((l) => e.translations[l.code]).map((l) => l.code.toUpperCase()).join(', ')}.
                  {' '}Фразы: {e.translations.ru?.keywords.join(', ')}
                </p>
                {writable ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => start(formOf(e), e.id, e.updatedAt)}>Изменить</button>
                    <button type="button" className="btn-secondary" onClick={() => setDeleting(e)}>Удалить</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="kn-gaps" className="an-card">
          <h2 id="kn-gaps" className="mb-1 text-xl font-semibold">Вопросы без ответа</h2>
          <p className="mb-3 text-sm text-muted">За 90 дней: помощник не нашёл ни ответа, ни документов. Почта и номера скрыты.</p>
          <ErrorMessage error={gaps.error} />
          {gaps.data && gaps.data.items.length === 0 ? <p className="text-muted">Таких вопросов нет.</p> : null}
          <ul className="flex flex-col gap-2">
            {gaps.data?.items.map((g) => (
              <li key={`${g.locale}-${g.text}`} className="rounded-md border border-border p-3">
                <p className="font-semibold" lang={g.locale}>{g.text}</p>
                <p className="text-sm text-muted">
                  {LOCALE[g.locale] ?? g.locale}, {g.count} раз{g.lastAt ? <>, последний <time dateTime={g.lastAt}>{formatDateTime(g.lastAt)}</time></> : null}
                </p>
                {writable ? (
                  <button type="button" className="btn-secondary mt-2" onClick={() => start(emptyForm(g.text, isAdminLocale(g.locale) ? g.locale : 'ru'))}>
                    Сделать ответ
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Удалить ответ?"
        description={`Помощник перестанет отвечать «${deleting?.translations.ru?.question ?? ''}». Действие нельзя отменить.`}
        confirmLabel="Удалить"
        danger
        onConfirm={() => { if (deleting) void remove(deleting); }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
