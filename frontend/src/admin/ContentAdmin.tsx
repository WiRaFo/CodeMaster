import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { AdminHeading, ErrorMessage, useAuth } from './AdminApp.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { AdminApiError, adminRequest, errorText } from './api.ts';
import { useAdminData } from './useAdminData.ts';
import { ADMIN_LOCALES, type AdminLocale } from './format.ts';

const TR_STATUS: Record<string, string> = { reviewed: 'проверен', machine: 'машинный перевод', missing: 'нет' };

interface PageRow { key: string; title: string; actualizedAt: string | null; pending: number; languages: Array<{ locale: string; status: string }> }

/** Справочные страницы (F-052): список с датой актуализации и числом блоков «ожидаются сведения». */
export function PagesAdminPage() {
  const list = useAdminData<{ items: PageRow[] }>('/admin/pages');
  return (
    <>
      <AdminHeading title="Справочные страницы" />
      <p className="mb-4 max-w-3xl">Государственная и платные услуги, законодательство, читальный зал, символы, полезные ссылки. Изменения сразу видны на сайте и записываются в журнал.</p>
      <ErrorMessage error={list.error} />
      {list.data ? (
        <table className="admin-table">
          <thead><tr><th scope="col">Страница</th><th scope="col">Актуализирована</th><th scope="col">Ожидают сведений</th><th scope="col">Языки</th></tr></thead>
          <tbody>
            {list.data.items.map((p) => (
              <tr key={p.key}>
                <td><Link to={`/admin/pages/${p.key}`}>{p.title}</Link></td>
                <td>{p.actualizedAt ?? 'нет'}</td>
                <td>{p.pending ? `блоков: ${p.pending}` : 'нет'}</td>
                <td>{p.languages.map((l) => `${l.locale.toUpperCase()}: ${TR_STATUS[l.status] ?? l.status}`).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

interface PageForm { title: string; lead: string; markup: string }
interface PageDetail { key: string; updatedAt: string; actualizedAt: string | null; translations: Partial<Record<AdminLocale, PageForm & { lead: string | null; translationStatus: string }>> }

export function PageEditPage() {
  const params = useParams();
  const key = params['*'] ?? '';
  const { can } = useAuth();
  const loaded = useAdminData<PageDetail>(`/admin/pages/${key}`);
  const [forms, setForms] = useState<Record<AdminLocale, PageForm> | null>(null);
  const [actualizedAt, setActualizedAt] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const d = loaded.data;
    if (!d) return;
    const f = (l: AdminLocale): PageForm => ({ title: d.translations[l]?.title ?? '', lead: d.translations[l]?.lead ?? '', markup: d.translations[l]?.markup ?? '' });
    setForms({ ru: f('ru'), kk: f('kk'), en: f('en') });
    setActualizedAt(d.actualizedAt ?? new Date().toISOString().slice(0, 10));
    setUpdatedAt(d.updatedAt);
  }, [loaded.data]);

  if (loaded.error) return <><AdminHeading title="Справочная страница" /><ErrorMessage error={loaded.error} /></>;
  if (!forms || !loaded.data) return <p>Загрузка…</p>;
  const readOnly = !can('pages:publish');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    const translations = Object.fromEntries(ADMIN_LOCALES.filter((l) => forms[l.code].title.trim()).map((l) => [l.code, forms[l.code]]));
    try {
      const res = await adminRequest<{ updatedAt: string; changed: string[] }>('PUT', `/admin/pages/${key}`, { actualizedAt, translations }, { 'If-Match': updatedAt });
      setUpdatedAt(res.updatedAt);
      setStatus(res.changed.length ? `Сохранено. Изменены языки: ${res.changed.map((c) => c.toUpperCase()).join(', ')}.` : 'Сохранено, изменений нет.');
    } catch (e) {
      setError(e instanceof AdminApiError && e.code === 'VALIDATION_FAILED' ? `Проверьте текст: ${e.message}` : errorText(e));
    }
  };

  return (
    <>
      <AdminHeading title={`Страница: ${forms.ru.title || key}`} />
      <p className="mb-4"><Link to="/admin/pages">К списку страниц</Link> · <a href={`/ru/${key}`}>Открыть на сайте</a></p>
      {readOnly ? <p className="mb-4 font-semibold">У вашей роли нет права публиковать: страница открыта только для просмотра.</p> : null}
      <details className="mb-4 max-w-3xl rounded border border-border p-3">
        <summary className="cursor-pointer font-semibold">Как оформлять текст</summary>
        <ul className="mt-2 list-disc pl-6">
          <li><code>## Заголовок</code> — подзаголовок раздела.</li>
          <li><code>- пункт</code> или <code>1. пункт</code> — список.</li>
          <li><code>! текст</code> — блок «Ожидаются сведения архива».</li>
          <li><code>[Название](https://адрес) — примечание</code> — внешняя ссылка, только https.</li>
          <li><code>[Название](/files/documents/prikaz-1-2026.pdf) — примечание</code> — документ PDF, опубликованный на самом сайте (имя файла латиницей, строчными буквами).</li>
          <li>Пустая строка разделяет абзацы. HTML не поддерживается.</li>
        </ul>
      </details>
      <form onSubmit={(e) => void submit(e)} className="flex max-w-4xl flex-col gap-4">
        <div className="admin-field max-w-xs">
          <label htmlFor="pg-date">Дата актуализации</label>
          <input id="pg-date" className="input" type="date" value={actualizedAt} readOnly={readOnly} onChange={(e) => setActualizedAt(e.target.value)} />
        </div>
        {ADMIN_LOCALES.map((l) => (
          <fieldset key={l.code} className="flex flex-col gap-3">
            <legend className="mb-2 text-xl font-semibold">{l.label}{loaded.data?.translations[l.code] ? ` (${TR_STATUS[loaded.data.translations[l.code]?.translationStatus ?? ''] ?? ''})` : ''}</legend>
            {(['title', 'lead'] as const).map((k) => (
              <div key={k} className="admin-field">
                <label htmlFor={`pg-${l.code}-${k}`}>{k === 'title' ? `Заголовок${l.code === 'ru' ? ' (обязательно)' : ''}` : 'Вводный абзац'}</label>
                <input id={`pg-${l.code}-${k}`} className="input" lang={l.code} readOnly={readOnly} value={forms[l.code][k]}
                  onChange={(e) => setForms({ ...forms, [l.code]: { ...forms[l.code], [k]: e.target.value } })} />
              </div>
            ))}
            <div className="admin-field">
              <label htmlFor={`pg-${l.code}-markup`}>Текст страницы</label>
              <textarea id={`pg-${l.code}-markup`} className="input min-h-64 font-mono" lang={l.code} readOnly={readOnly} value={forms[l.code].markup}
                onChange={(e) => setForms({ ...forms, [l.code]: { ...forms[l.code], markup: e.target.value } })} />
            </div>
          </fieldset>
        ))}
        <ErrorMessage error={error} />
        <p role="status">{status}</p>
        {readOnly ? null : <div><button type="submit" className="btn-primary">Сохранить и опубликовать</button></div>}
      </form>
    </>
  );
}

// ---------- Вопросы и ответы ----------

const TOPIC: Record<string, string> = { services: 'Справки и услуги', catalog: 'Каталог и поиск', access: 'Доступ к документам', visit: 'Посещение архива', site: 'Работа сайта' };
interface FaqRow { id: string; topic: string; sortOrder: number; published: boolean; dataOrigin: 'verified' | 'demo'; updatedAt: string; translations: Partial<Record<AdminLocale, { question: string; answer: string; translationStatus: string }>> }
interface FaqForm { topic: string; sortOrder: string; published: boolean; dataOrigin: 'verified' | 'demo'; texts: Record<AdminLocale, { question: string; answer: string }> }

const emptyFaq = (): FaqForm => ({ topic: 'site', sortOrder: '0', published: false, dataOrigin: 'verified', texts: { ru: { question: '', answer: '' }, kk: { question: '', answer: '' }, en: { question: '', answer: '' } } });
const formOf = (f: FaqRow): FaqForm => ({
  topic: f.topic, sortOrder: String(f.sortOrder), published: f.published, dataOrigin: f.dataOrigin,
  texts: { ru: { question: f.translations.ru?.question ?? '', answer: f.translations.ru?.answer ?? '' }, kk: { question: f.translations.kk?.question ?? '', answer: f.translations.kk?.answer ?? '' }, en: { question: f.translations.en?.question ?? '', answer: f.translations.en?.answer ?? '' } },
});

/** Вопросы и ответы по темам (дополнение к ТЗ §2): добавление, правка, публикация, удаление с подтверждением. */
export function FaqAdminPage() {
  const { can } = useAuth();
  const list = useAdminData<{ topics: string[]; items: FaqRow[] }>('/admin/faq');
  const [editing, setEditing] = useState<{ id: string | null; updatedAt: string | null; form: FaqForm } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FaqRow | null>(null);
  const writable = can('pages:publish');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    const f = editing.form;
    const translations = Object.fromEntries(ADMIN_LOCALES.filter((l) => f.texts[l.code].question.trim()).map((l) => [l.code, f.texts[l.code]]));
    try {
      await adminRequest(editing.id ? 'PUT' : 'POST', editing.id ? `/admin/faq/${editing.id}` : '/admin/faq',
        { topic: f.topic, sortOrder: Number(f.sortOrder) || 0, published: f.published, dataOrigin: f.dataOrigin, translations },
        editing.updatedAt ? { 'If-Match': editing.updatedAt } : {});
      setStatus(editing.id ? 'Вопрос сохранён.' : 'Вопрос добавлен.');
      setEditing(null);
      list.reload();
    } catch (e) {
      setError(e instanceof AdminApiError && e.code === 'VALIDATION_FAILED' ? 'Заполните вопрос и ответ на русском языке (не короче 5 символов).' : errorText(e));
    }
  };

  const remove = async (row: FaqRow) => {
    try {
      await adminRequest('DELETE', `/admin/faq/${row.id}`, { confirm: true });
      setStatus('Вопрос удалён.');
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setDeleting(null);
    }
  };

  const setText = (l: AdminLocale, k: 'question' | 'answer', v: string) => editing && setEditing({ ...editing, form: { ...editing.form, texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } } });

  return (
    <>
      <AdminHeading title="Вопросы и ответы">
        {writable && !editing ? <button type="button" className="btn-primary" onClick={() => { setStatus(null); setEditing({ id: null, updatedAt: null, form: emptyFaq() }); }}>Добавить вопрос</button> : null}
      </AdminHeading>
      <p role="status" className="mb-2">{status}</p>
      <ErrorMessage error={list.error ?? (editing ? null : error)} />
      {editing ? (
        <form aria-label={editing.id ? 'Правка вопроса' : 'Новый вопрос'} onSubmit={(e) => void save(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{editing.id ? 'Правка вопроса' : 'Новый вопрос'}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="admin-field">
              <label htmlFor="faq-topic">Тема</label>
              <select id="faq-topic" className="input" value={editing.form.topic} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, topic: e.target.value } })}>
                {(list.data?.topics ?? Object.keys(TOPIC)).map((tp) => <option key={tp} value={tp}>{TOPIC[tp] ?? tp}</option>)}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="faq-order">Порядок в теме</label>
              <input id="faq-order" className="input" inputMode="numeric" value={editing.form.sortOrder} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, sortOrder: e.target.value } })} />
            </div>
            <div className="admin-field">
              <label htmlFor="faq-origin">Происхождение</label>
              <select id="faq-origin" className="input" value={editing.form.dataOrigin} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, dataOrigin: e.target.value === 'demo' ? 'demo' : 'verified' } })}>
                <option value="verified">Согласовано с архивом</option>
                <option value="demo">Демонстрационный</option>
              </select>
            </div>
          </div>
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="flex flex-col gap-2">
              <legend className="font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ''}</legend>
              <div className="admin-field">
                <label htmlFor={`faq-${l.code}-q`}>Вопрос</label>
                <input id={`faq-${l.code}-q`} className="input" lang={l.code} value={editing.form.texts[l.code].question} onChange={(e) => setText(l.code, 'question', e.target.value)} />
              </div>
              <div className="admin-field">
                <label htmlFor={`faq-${l.code}-a`}>Ответ</label>
                <textarea id={`faq-${l.code}-a`} className="input min-h-24" lang={l.code} value={editing.form.texts[l.code].answer} onChange={(e) => setText(l.code, 'answer', e.target.value)} />
              </div>
            </fieldset>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={editing.form.published} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, published: e.target.checked } })} />
            Показывать на сайте
          </label>
          <ErrorMessage error={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">Сохранить</button>
            <button type="button" className="btn-secondary" onClick={() => { setEditing(null); setError(null); }}>Отмена</button>
          </div>
        </form>
      ) : null}
      {list.data ? (
        (list.data.topics).map((tp) => {
          const items = list.data?.items.filter((f) => f.topic === tp) ?? [];
          return (
            <section key={tp} aria-labelledby={`faq-admin-${tp}`} className="mb-6 max-w-3xl">
              <h2 id={`faq-admin-${tp}`} className="mb-2 text-xl font-semibold">{TOPIC[tp] ?? tp} ({items.length})</h2>
              {items.length === 0 ? <p className="text-muted">Вопросов нет.</p> : (
                <ul className="flex flex-col gap-2">
                  {items.map((f) => (
                    <li key={f.id} className="rounded-md border border-border bg-surface p-3">
                      <p className="font-semibold">{f.translations.ru?.question ?? f.translations.kk?.question ?? f.id}</p>
                      <p className="text-sm text-muted">
                        {f.published ? 'На сайте' : 'Скрыт'}{f.dataOrigin === 'demo' ? ', демонстрационный' : ''}. Языки: {ADMIN_LOCALES.filter((l) => f.translations[l.code]).map((l) => l.code.toUpperCase()).join(', ')}
                      </p>
                      {writable ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" className="btn-secondary" onClick={() => { setStatus(null); setError(null); setEditing({ id: f.id, updatedAt: f.updatedAt, form: formOf(f) }); }}>Изменить</button>
                          <button type="button" className="btn-secondary" onClick={() => setDeleting(f)}>Удалить</button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить вопрос?"
        description={`Вопрос «${deleting?.translations.ru?.question ?? ''}» исчезнет с сайта. Действие нельзя отменить.`}
        confirmLabel="Удалить"
        danger
        onConfirm={() => { if (deleting) void remove(deleting); }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
