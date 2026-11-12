import { useState, type FormEvent } from 'react';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { AdminApiError, adminRequest, errorText } from './api.ts';
import { useAdminData } from './useAdminData.ts';
import { ADMIN_LOCALES, formatDay, type AdminLocale } from './format.ts';

const RUBRIC: Record<string, string> = { news: 'Новости', announcements: 'Объявления', events: 'Мероприятия' };
const STATUS: Record<string, string> = { draft: 'Черновик', published: 'На сайте', archived: 'Снята с публикации' };

interface Text { title: string; lead: string; bodyText: string }
interface NewsRow {
  id: string;
  slug: string;
  title: string;
  rubric: string | null;
  branchSlug: string | null;
  status: string;
  publishedAt: string | null;
  dataOrigin: string;
  sourceUrl: string | null;
  updatedAt: string;
  translations: Partial<Record<AdminLocale, Text>>;
}
interface NewsList {
  items: NewsRow[];
  rubrics: string[];
  branches: Array<{ slug: string; name: string }>;
  branchRequired: boolean;
  canPublish: boolean;
}
interface Form { slug: string; rubric: string; branchSlug: string; dataOrigin: 'verified' | 'demo'; sourceUrl: string; texts: Record<AdminLocale, Text> }
interface Editing { id: string | null; updatedAt: string | null; form: Form }
interface Pending { row: NewsRow; action: 'unpublish' | 'delete' }

const emptyText = (): Text => ({ title: '', lead: '', bodyText: '' });
const emptyForm = (branchSlug: string): Form => ({
  slug: '', rubric: 'news', branchSlug, dataOrigin: 'verified', sourceUrl: '',
  texts: { ru: emptyText(), kk: emptyText(), en: emptyText() },
});
const formOf = (n: NewsRow): Form => ({
  slug: n.slug,
  rubric: n.rubric ?? 'news',
  branchSlug: n.branchSlug ?? '',
  dataOrigin: n.dataOrigin === 'demo' ? 'demo' : 'verified',
  sourceUrl: n.sourceUrl ?? '',
  texts: Object.fromEntries(ADMIN_LOCALES.map((l) => {
    const t = n.translations[l.code];
    return [l.code, t ? { title: t.title, lead: t.lead ?? '', bodyText: t.bodyText } : emptyText()];
  })) as Record<AdminLocale, Text>,
});

const ERRORS: Record<string, string> = {
  VALIDATION_FAILED: 'Проверьте поля: адрес латиницей через дефис, заголовок на русском от 5 символов, текст от 10 символов, источник только https.',
  CONFLICT: 'Такой адрес уже занят, или новость изменена другим сотрудником: обновите страницу.',
  FORBIDDEN: 'Недостаточно прав: опубликованную новость правит и публикует сотрудник с правом публикации.',
};
const when = (iso: string | null) => (iso ? formatDay(iso) : 'не опубликована');

/**
 * Новости (ТЗ §5.11, F-100): список, создание и правка на трёх языках, публикация и снятие, удаление.
 * Новость создаётся черновиком; администратор филиала пишет только новости своего филиала и не публикует их.
 */
export function NewsAdminPage() {
  const list = useAdminData<NewsList>('/admin/news');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const data = list.data;

  const fail = (e: unknown) => setError(e instanceof AdminApiError ? (ERRORS[e.code] ?? errorText(e)) : errorText(e));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    const f = editing.form;
    const translations = Object.fromEntries(ADMIN_LOCALES.filter((l) => f.texts[l.code].title.trim()).map((l) => [l.code, f.texts[l.code]]));
    const body = { slug: f.slug, rubric: f.rubric, branchSlug: f.branchSlug || null, dataOrigin: f.dataOrigin, sourceUrl: f.sourceUrl, translations };
    try {
      await adminRequest(editing.id ? 'PUT' : 'POST', editing.id ? `/admin/news/${editing.id}` : '/admin/news', body, editing.updatedAt ? { 'If-Match': editing.updatedAt } : {});
      setStatus(editing.id ? 'Новость сохранена.' : 'Новость создана черновиком.');
      setEditing(null);
      list.reload();
    } catch (e) {
      fail(e);
    }
  };

  const run = async (row: NewsRow, action: 'publish' | 'unpublish' | 'delete') => {
    setError(null);
    try {
      if (action === 'delete') await adminRequest('DELETE', `/admin/news/${row.id}`, { confirm: true });
      else await adminRequest('POST', `/admin/news/${row.id}/${action}`, { confirm: true }, { 'If-Match': row.updatedAt });
      setStatus(`«${row.title}»: ${action === 'publish' ? 'опубликована' : action === 'unpublish' ? 'снята с публикации' : 'удалена'}.`);
      list.reload();
    } catch (e) {
      fail(e);
    } finally {
      setPending(null);
    }
  };

  const setField = (patch: Partial<Form>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const setText = (l: AdminLocale, k: keyof Text, v: string) => editing && setField({ texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } });

  return (
    <>
      <AdminHeading title="Новости">
        {data && !editing ? (
          <button type="button" className="btn-primary" onClick={() => { setStatus(null); setError(null); setEditing({ id: null, updatedAt: null, form: emptyForm(data.branchRequired ? (data.branches[0]?.slug ?? '') : '') }); }}>
            Добавить новость
          </button>
        ) : null}
      </AdminHeading>
      <p className="mb-4 max-w-3xl">Новость создаётся черновиком и появляется на сайте после публикации. Текст пишется абзацами через пустую строку, без оформления.</p>
      <p role="status" className="mb-2">{status}</p>
      <ErrorMessage error={list.error ?? (editing ? null : error)} />

      {editing && data ? (
        <form aria-label={editing.id ? 'Правка новости' : 'Новая новость'} onSubmit={(e) => void save(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{editing.id ? 'Правка новости' : 'Новая новость'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="admin-field">
              <label htmlFor="news-slug">Адрес страницы</label>
              <p id="news-slug-hint" className="hint">Латиница, цифры и дефис, например archive-day-2026.</p>
              <input id="news-slug" className="input" aria-describedby="news-slug-hint" value={editing.form.slug} onChange={(e) => setField({ slug: e.target.value })} />
            </div>
            <div className="admin-field">
              <label htmlFor="news-rubric">Рубрика</label>
              <select id="news-rubric" className="input" value={editing.form.rubric} onChange={(e) => setField({ rubric: e.target.value })}>
                {data.rubrics.map((r) => <option key={r} value={r}>{RUBRIC[r] ?? r}</option>)}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="news-branch">Филиал</label>
              <select id="news-branch" className="input" value={editing.form.branchSlug} onChange={(e) => setField({ branchSlug: e.target.value })}>
                {data.branchRequired ? null : <option value="">Весь архив</option>}
                {data.branches.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="news-origin">Происхождение</label>
              <select id="news-origin" className="input" value={editing.form.dataOrigin} onChange={(e) => setField({ dataOrigin: e.target.value === 'demo' ? 'demo' : 'verified' })}>
                <option value="verified">Согласовано с архивом</option>
                <option value="demo">Демонстрационная</option>
              </select>
            </div>
          </div>
          <div className="admin-field">
            <label htmlFor="news-source">Источник (необязательно)</label>
            <input id="news-source" className="input" type="url" placeholder="https://" value={editing.form.sourceUrl} onChange={(e) => setField({ sourceUrl: e.target.value })} />
          </div>
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="flex flex-col gap-2">
              <legend className="font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ' (пусто — без этой версии)'}</legend>
              <div className="admin-field">
                <label htmlFor={`news-${l.code}-title`}>Заголовок</label>
                <input id={`news-${l.code}-title`} className="input" lang={l.code} value={editing.form.texts[l.code].title} onChange={(e) => setText(l.code, 'title', e.target.value)} />
              </div>
              <div className="admin-field">
                <label htmlFor={`news-${l.code}-lead`}>Анонс</label>
                <textarea id={`news-${l.code}-lead`} className="input min-h-16" lang={l.code} value={editing.form.texts[l.code].lead} onChange={(e) => setText(l.code, 'lead', e.target.value)} />
              </div>
              <div className="admin-field">
                <label htmlFor={`news-${l.code}-body`}>Текст</label>
                <textarea id={`news-${l.code}-body`} className="input min-h-40" lang={l.code} value={editing.form.texts[l.code].bodyText} onChange={(e) => setText(l.code, 'bodyText', e.target.value)} />
              </div>
            </fieldset>
          ))}
          <ErrorMessage error={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">Сохранить</button>
            <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setError(null); }}>Отмена</button>
          </div>
        </form>
      ) : null}

      {data ? (
        data.items.length === 0 ? <p>Новостей нет.</p> : (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th scope="col">Новость</th><th scope="col">Рубрика</th><th scope="col">Состояние</th><th scope="col">Дата</th><th scope="col"><span className="visually-hidden">Действия</span></th></tr></thead>
              <tbody>
                {data.items.map((n) => (
                  <tr key={n.id}>
                    <td>{n.title}{n.dataOrigin === 'demo' ? <span className="text-sm text-muted"> (демо)</span> : null}</td>
                    <td>{n.rubric ? (RUBRIC[n.rubric] ?? n.rubric) : 'нет'}</td>
                    <td>{STATUS[n.status] ?? n.status}</td>
                    <td>{when(n.publishedAt)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {n.status !== 'published' || data.canPublish ? (
                          <button type="button" className="btn-secondary" aria-label={`Изменить: ${n.title}`} onClick={() => { setStatus(null); setError(null); setEditing({ id: n.id, updatedAt: n.updatedAt, form: formOf(n) }); }}>Изменить</button>
                        ) : null}
                        {data.canPublish && n.status !== 'published' ? (
                          <button type="button" className="btn-secondary" aria-label={`Опубликовать: ${n.title}`} onClick={() => void run(n, 'publish')}>Опубликовать</button>
                        ) : null}
                        {data.canPublish && n.status === 'published' ? (
                          <button type="button" className="btn-secondary" aria-label={`Снять с публикации: ${n.title}`} onClick={() => setPending({ row: n, action: 'unpublish' })}>Снять</button>
                        ) : null}
                        {data.canPublish ? (
                          <button type="button" className="btn-secondary" aria-label={`Удалить: ${n.title}`} onClick={() => setPending({ row: n, action: 'delete' })}>Удалить</button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.action === 'delete' ? 'Удалить новость?' : 'Снять новость с публикации?'}
        description={pending?.action === 'delete'
          ? `Новость «${pending.row.title}» будет удалена из панели и с сайта. Действие нельзя отменить.`
          : `Новость «${pending?.row.title ?? ''}» исчезнет с сайта. Опубликовать её можно снова.`}
        confirmLabel={pending?.action === 'delete' ? 'Удалить' : 'Снять'}
        danger
        onConfirm={() => { if (pending) void run(pending.row, pending.action); }}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
