import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AdminHeading, ErrorMessage, useAuth } from './AdminApp.tsx';
import { AdminApiError, adminRequest, adminUpload, errorText } from './api.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { ACTION_LABEL, STATUS_LABEL, actionPath } from './labels.ts';
import { useAdminData } from './useAdminData.ts';

/** ЭТАП 8. Выставки в панели управления (ТЗ §6.5, с. 14–15; F-148). */

const LOCALES = ['ru', 'kk', 'en'] as const;
type Loc = (typeof LOCALES)[number];
const LOCALE_NAME: Record<Loc, string> = { ru: 'Русский', kk: 'Казахский', en: 'Английский' };

interface Row {
  id: string;
  slug: string;
  status: string;
  dataOrigin: string;
  title: string | null;
  itemCount: number;
  updatedAt: string;
}

interface ExTr {
  title: string | null;
  lead: string | null;
  description: string | null;
}
interface ItemTr {
  title: string | null;
  description: string | null;
  sourceNote: string | null;
  altText: string | null;
}
interface AdminItem {
  id: string;
  number: number;
  documentId: string | null;
  documentTitle: string | null;
  image: { mimeType: string; antivirusStatus: string; processingStatus: string; filename: string } | null;
  translations: Partial<Record<Loc, ItemTr>>;
}
interface Issue {
  path: string[];
  code: string;
}
interface Detail {
  id: string;
  status: string;
  updatedAt: string;
  input: { slug: string; yearFrom: number | null; yearTo: number | null; isFeatured: boolean; dataOrigin: string; topics: string[]; translations: Partial<Record<Loc, ExTr>> };
  items: AdminItem[];
  issues: Issue[];
  actions: string[];
  canEdit: boolean;
  canUpload: boolean;
  history: Array<{ at: string; action: string; summary: string; user: string | null }>;
}

const EX_PERMS = ['exhibitions:edit', 'exhibitions:submit', 'exhibitions:review', 'exhibitions:publish'];
export const canSeeExhibitions = (can: (p: string) => boolean) => EX_PERMS.some(can);

const issueText = (issue: Issue): string => {
  const [head, index, loc, field] = issue.path;
  if (head === 'items' && index === undefined) return 'Добавьте хотя бы один экспонат';
  if (head === 'items') {
    const name = { title: 'название', sourceNote: 'источник', altText: 'описание изображения для незрячих (alt)' }[field ?? loc ?? ''] ?? field ?? '';
    const lang = loc && loc in LOCALE_NAME ? ` (${LOCALE_NAME[loc as Loc]})` : '';
    return `Экспонат ${Number(index) + 1}: заполните ${name}${lang}`;
  }
  if (head === 'translations') {
    const name = { title: 'название', description: 'описание', lead: 'вводный текст' }[loc === undefined ? '' : (issue.path[2] ?? '')] ?? '';
    return `Заполните ${name} выставки (${LOCALE_NAME[(index ?? 'ru') as Loc] ?? index})`;
  }
  return `Проверьте поле ${issue.path.join('.')}`;
};

export function ExhibitionsAdminPage() {
  const { can } = useAuth();
  const list = useAdminData<{ items: Row[] }>('/admin/exhibitions');
  return (
    <>
      <AdminHeading title="Выставки">
        {can('exhibitions:edit') ? <Link to="/admin/exhibitions/new" className="btn-primary">Создать выставку</Link> : null}
      </AdminHeading>
      <ErrorMessage error={list.error} />
      {list.data ? (
        list.data.items.length ? (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <caption className="visually-hidden">Выставки и их статусы</caption>
              <thead>
                <tr>
                  <th scope="col">Название</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Экспонатов</th>
                  <th scope="col">Изменено</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/admin/exhibitions/${r.id}`}>{r.title ?? r.slug}</Link></td>
                    <td><span className="status-badge" data-status={r.status}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                    <td>{r.itemCount}</td>
                    <td>{new Date(r.updatedAt).toLocaleString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>Выставок пока нет.</p>
        )
      ) : null}
    </>
  );
}

interface FormState {
  slug: string;
  yearFrom: string;
  yearTo: string;
  isFeatured: boolean;
  dataOrigin: string;
  topics: string[];
  translations: Record<Loc, { title: string; lead: string; description: string }>;
}

const emptyForm = (): FormState => ({
  slug: '',
  yearFrom: '',
  yearTo: '',
  isFeatured: false,
  dataOrigin: 'demo',
  topics: [],
  translations: { ru: { title: '', lead: '', description: '' }, kk: { title: '', lead: '', description: '' }, en: { title: '', lead: '', description: '' } },
});

function toForm(d: Detail): FormState {
  const f = emptyForm();
  return {
    ...f,
    slug: d.input.slug,
    yearFrom: d.input.yearFrom?.toString() ?? '',
    yearTo: d.input.yearTo?.toString() ?? '',
    isFeatured: d.input.isFeatured,
    dataOrigin: d.input.dataOrigin === 'verified' ? 'verified' : 'demo',
    topics: d.input.topics,
    translations: Object.fromEntries(
      LOCALES.map((l) => [l, { title: d.input.translations[l]?.title ?? '', lead: d.input.translations[l]?.lead ?? '', description: d.input.translations[l]?.description ?? '' }]),
    ) as FormState['translations'],
  };
}

const toInput = (f: FormState) => ({
  slug: f.slug.trim(),
  yearFrom: f.yearFrom.trim() || null,
  yearTo: f.yearTo.trim() || null,
  isFeatured: f.isFeatured,
  dataOrigin: f.dataOrigin,
  topics: f.topics,
  translations: Object.fromEntries(LOCALES.map((l) => [l, { title: f.translations[l].title || null, lead: f.translations[l].lead || null, description: f.translations[l].description || null }])),
});

export function ExhibitionEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { refreshNotifications } = useAuth();
  const detail = useAdminData<Detail>(isNew ? null : `/admin/exhibitions/${id}`);
  const topics = useAdminData<{ items: Array<{ slug: string; name: string }> }>('/admin/exhibitions/topics');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | 'request_changes' | 'archive' | 'delete'>(null);

  useEffect(() => {
    if (detail.data) setForm(toForm(detail.data));
  }, [detail.data]);

  const d = detail.data;
  const editable = isNew || Boolean(d?.canEdit);
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      detail.reload();
      refreshNotifications();
    } catch (e) {
      setError(e instanceof AdminApiError && e.code === 'INCOMPLETE_RECORD' ? `${errorText(e)} ${e.details.map((x) => issueText({ path: x.path.map(String), code: x.code })).join('; ')}.` : errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (isNew) {
        const res = await adminRequest<{ id: string }>('POST', '/admin/exhibitions', toInput(form));
        navigate(`/admin/exhibitions/${res.id}`);
      } else if (d) {
        await adminRequest('PATCH', `/admin/exhibitions/${d.id}`, toInput(form), { 'If-Match': d.updatedAt });
      }
    }, isNew ? undefined : 'Изменения сохранены.');
  };

  const act = (action: string, body: Record<string, unknown> = {}) =>
    d && void run(async () => {
      await adminRequest('POST', `/admin/exhibitions/${d.id}/${actionPath(action)}`, body);
    }, `Выполнено: ${ACTION_LABEL[action] ?? action}.`);

  const setTr = (l: Loc, key: 'title' | 'lead' | 'description', value: string) =>
    setForm((f) => ({ ...f, translations: { ...f.translations, [l]: { ...f.translations[l], [key]: value } } }));

  if (!isNew && !d) return detail.error ? <ErrorMessage error={detail.error} /> : <p>Загрузка…</p>;
  const title = isNew ? 'Новая выставка' : (d?.input.translations.ru?.title ?? d?.input.slug ?? 'Выставка');

  return (
    <>
      <p className="mb-2"><Link to="/admin/exhibitions">← Все выставки</Link></p>
      <AdminHeading title={title} />
      {d ? (
        <section aria-labelledby="ex-status" className="mb-6 rounded border border-border p-4">
          <h2 id="ex-status" className="mb-2 text-xl font-bold">Статус и согласование</h2>
          <p className="mb-3">
            <span className="status-badge" data-status={d.status} data-testid="ex-status">{STATUS_LABEL[d.status] ?? d.status}</span>
            {d.status === 'published' ? <> · <a href={`/ru/exhibitions/${d.input.slug}`}>Открыть на сайте</a></> : null}
          </p>
          {d.issues.length && (d.status === 'draft' || d.status === 'needs_changes') ? (
            <div className="mb-3">
              <p className="font-semibold">До отправки на проверку:</p>
              <ul className="list-disc pl-6" data-testid="ex-issues">
                {d.issues.map((i) => <li key={i.path.join('.')}>{issueText(i)}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {d.actions.map((a) => (
              <button
                key={a}
                type="button"
                className={a === 'publish' || a === 'submit' || a === 'approve' ? 'btn-primary' : 'btn-secondary'}
                disabled={busy}
                onClick={() => (a === 'request_changes' || a === 'archive' ? setDialog(a) : act(a))}
              >
                {ACTION_LABEL[a] ?? a}
              </button>
            ))}
            {d.actions.length === 0 ? <p className="text-muted">Для вашей роли действий в этом статусе нет.</p> : null}
          </div>
        </section>
      ) : null}

      <ErrorMessage error={error} />
      {notice ? <p role="status" className="my-3 font-semibold">{notice}</p> : null}

      <form onSubmit={save} className="mb-8">
        <fieldset disabled={!editable || busy} className="grid gap-x-6 lg:grid-cols-2">
          <legend className="visually-hidden">Описание выставки</legend>
          <AField id="ex-slug" label="Адрес на сайте (латиница, цифры и дефис)" hint="Например: industry-1960s. Станет частью ссылки /exhibitions/…">
            <input id="ex-slug" className="input" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} aria-describedby="ex-slug-hint" />
          </AField>
          <div className="grid grid-cols-2 gap-3">
            <AField id="ex-from" label="Год с">
              <input id="ex-from" className="input" inputMode="numeric" value={form.yearFrom} onChange={(e) => setForm({ ...form, yearFrom: e.target.value })} />
            </AField>
            <AField id="ex-to" label="Год по">
              <input id="ex-to" className="input" inputMode="numeric" value={form.yearTo} onChange={(e) => setForm({ ...form, yearTo: e.target.value })} />
            </AField>
          </div>
          <fieldset className="admin-field">
            <legend className="font-semibold">Тематики</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {(topics.data?.items ?? []).map((tp) => (
                <label key={tp.slug} className="choice">
                  <input
                    type="checkbox"
                    checked={form.topics.includes(tp.slug)}
                    onChange={(e) => setForm({ ...form, topics: e.target.checked ? [...form.topics, tp.slug] : form.topics.filter((x) => x !== tp.slug) })}
                  />
                  <span>{tp.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <fieldset className="admin-field">
              <legend className="font-semibold">Происхождение сведений</legend>
              <label className="choice">
                <input type="radio" name="ex-origin" checked={form.dataOrigin === 'verified'} onChange={() => setForm({ ...form, dataOrigin: 'verified' })} />
                <span>Материалы архива</span>
              </label>
              <label className="choice">
                <input type="radio" name="ex-origin" checked={form.dataOrigin === 'demo'} onChange={() => setForm({ ...form, dataOrigin: 'demo' })} />
                <span>Демонстрационная выставка (на сайте помечается «Демо»)</span>
              </label>
            </fieldset>
            <label className="choice">
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
              <span>Показывать первой на главной и в списке</span>
            </label>
          </div>
          {LOCALES.map((l) => (
            <details key={l} open={l === 'ru'} className="mb-4 rounded border border-border p-3 lg:col-span-2">
              <summary className="cursor-pointer text-lg font-semibold">Текст выставки: {LOCALE_NAME[l]}</summary>
              <div className="mt-3 grid gap-x-6 lg:grid-cols-2" lang={l}>
                <AField id={`ex-${l}-title`} label={l === 'ru' ? 'Название (обязательно)' : 'Название'}>
                  <input id={`ex-${l}-title`} className="input" required={l === 'ru'} value={form.translations[l].title} onChange={(e) => setTr(l, 'title', e.target.value)} />
                </AField>
                <AField id={`ex-${l}-lead`} label="Вводный текст">
                  <input id={`ex-${l}-lead`} className="input" value={form.translations[l].lead} onChange={(e) => setTr(l, 'lead', e.target.value)} />
                </AField>
                <AField id={`ex-${l}-description`} label="Описание (обязательно для отправки на проверку)">
                  <textarea id={`ex-${l}-description`} className="input min-h-24" value={form.translations[l].description} onChange={(e) => setTr(l, 'description', e.target.value)} />
                </AField>
              </div>
            </details>
          ))}
        </fieldset>
        {editable ? <button type="submit" className="btn-primary" disabled={busy}>{isNew ? 'Создать черновик' : 'Сохранить выставку'}</button> : null}
      </form>

      {d ? <ItemsSection detail={d} editable={editable} busy={busy} run={run} /> : null}

      {d?.history.length ? (
        <section aria-labelledby="ex-history" className="mt-8">
          <h2 id="ex-history" className="mb-2 text-2xl font-bold">История</h2>
          <ol className="grid gap-1 text-sm">
            {d.history.map((h) => (
              <li key={`${h.at}-${h.summary}`}>
                <time dateTime={h.at}>{new Date(h.at).toLocaleString('ru-RU')}</time> · {h.user ?? 'система'} · {h.summary}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <ConfirmDialog
        open={dialog === 'request_changes'}
        title="Вернуть на доработку"
        description="Автор получит уведомление с вашим комментарием."
        confirmLabel="Вернуть на доработку"
        withComment="Что нужно исправить (обязательно)"
        onCancel={() => setDialog(null)}
        onConfirm={(comment) => {
          setDialog(null);
          act('request_changes', { comment });
        }}
      />
      <ConfirmDialog
        open={dialog === 'archive'}
        danger
        title="Снять выставку с публикации?"
        description="Выставка перестанет открываться на сайте. Вернуть её можно действием «Опубликовать снова»."
        confirmLabel="Снять с публикации"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          act('archive', { confirm: true });
        }}
      />
    </>
  );
}

function ItemsSection({ detail: d, editable, busy, run }: { detail: Detail; editable: boolean; busy: boolean; run: (fn: () => Promise<void>, done?: string) => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="ex-items" className="mb-8">
      <h2 id="ex-items" className="mb-3 text-2xl font-bold">Экспонаты ({d.items.length})</h2>
      {d.items.length === 0 ? <p className="mb-3">Экспонатов пока нет.</p> : null}
      <ol className="mb-4 grid gap-4">
        {d.items.map((item, index) => (
          <li key={item.id} className="rounded border border-border p-3">
            <ItemForm
              exhibitionId={d.id}
              item={item}
              editable={editable}
              busy={busy}
              run={run}
              canUpload={d.canUpload}
              controls={
                editable ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secondary" disabled={busy || index === 0} onClick={() => void run(() => adminRequest('POST', `/admin/exhibitions/${d.id}/items/${item.id}/move`, { direction: 'up' }), `Экспонат ${index + 1} перемещён выше.`)}>
                      Выше<span className="visually-hidden"> (экспонат {index + 1})</span>
                    </button>
                    <button type="button" className="btn-secondary" disabled={busy || index === d.items.length - 1} onClick={() => void run(() => adminRequest('POST', `/admin/exhibitions/${d.id}/items/${item.id}/move`, { direction: 'down' }), `Экспонат ${index + 1} перемещён ниже.`)}>
                      Ниже<span className="visually-hidden"> (экспонат {index + 1})</span>
                    </button>
                  </div>
                ) : null
              }
            />
          </li>
        ))}
      </ol>
      {editable ? (
        adding ? (
          <div className="rounded border-2 border-primary p-3">
            <h3 className="mb-2 text-lg font-semibold">Новый экспонат</h3>
            <ItemForm exhibitionId={d.id} editable busy={busy} run={run} canUpload={false} onSaved={() => setAdding(false)} />
          </div>
        ) : (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>Добавить экспонат</button>
        )
      ) : null}
    </section>
  );
}

function ItemForm({
  exhibitionId,
  item,
  editable,
  busy,
  run,
  canUpload,
  controls,
  onSaved,
}: {
  exhibitionId: string;
  item?: AdminItem;
  editable: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>, done?: string) => Promise<void>;
  canUpload: boolean;
  controls?: ReactNode;
  onSaved?: () => void;
}) {
  const prefix = item ? `item-${item.number}` : 'item-new';
  const [tr, setTr] = useState<Record<Loc, { title: string; description: string; sourceNote: string; altText: string }>>(
    () =>
      Object.fromEntries(
        LOCALES.map((l) => [l, { title: item?.translations[l]?.title ?? '', description: item?.translations[l]?.description ?? '', sourceNote: item?.translations[l]?.sourceNote ?? '', altText: item?.translations[l]?.altText ?? '' }]),
      ) as Record<Loc, { title: string; description: string; sourceNote: string; altText: string }>,
  );
  const [documentId, setDocumentId] = useState(item?.documentId ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (l: Loc, k: 'title' | 'description' | 'sourceNote' | 'altText', v: string) => setTr((t) => ({ ...t, [l]: { ...t[l], [k]: v } }));
  const body = () => ({
    documentId: documentId.trim() || null,
    translations: Object.fromEntries(LOCALES.map((l) => [l, { title: tr[l].title || null, description: tr[l].description || null, sourceNote: tr[l].sourceNote || null, altText: tr[l].altText || null }])),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (item) await adminRequest('PATCH', `/admin/exhibitions/${exhibitionId}/items/${item.id}`, body());
      else await adminRequest('POST', `/admin/exhibitions/${exhibitionId}/items`, body());
      onSaved?.();
    }, item ? `Экспонат ${item.number} сохранён.` : 'Экспонат добавлен.');
  };

  return (
    <form onSubmit={submit} aria-label={item ? `Экспонат ${item.number}` : 'Новый экспонат'}>
      {item ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Экспонат {item.number}</h3>
          {controls}
        </div>
      ) : null}
      <fieldset disabled={!editable || busy} className="grid gap-x-6 lg:grid-cols-2">
        <legend className="visually-hidden">Сведения об экспонате</legend>
        {LOCALES.map((l) => (
          <details key={l} open={l === 'ru'} className="mb-3 rounded border border-border p-2 lg:col-span-2">
            <summary className="cursor-pointer font-semibold">Текст экспоната: {LOCALE_NAME[l]}</summary>
            <div className="mt-2 grid gap-x-6 lg:grid-cols-2" lang={l}>
              <AField id={`${prefix}-${l}-title`} label={l === 'ru' ? 'Название (обязательно)' : 'Название'}>
                <input id={`${prefix}-${l}-title`} className="input" required={l === 'ru'} value={tr[l].title} onChange={(e) => set(l, 'title', e.target.value)} />
              </AField>
              <AField id={`${prefix}-${l}-source`} label="Источник (обязательно для отправки на проверку)">
                <input id={`${prefix}-${l}-source`} className="input" value={tr[l].sourceNote} onChange={(e) => set(l, 'sourceNote', e.target.value)} />
              </AField>
              <AField id={`${prefix}-${l}-description`} label="Описание">
                <textarea id={`${prefix}-${l}-description`} className="input min-h-20" value={tr[l].description} onChange={(e) => set(l, 'description', e.target.value)} />
              </AField>
              <AField id={`${prefix}-${l}-alt`} label="Описание изображения для незрячих (alt)" hint="Обязательно, если у экспоната есть изображение">
                <input id={`${prefix}-${l}-alt`} className="input" value={tr[l].altText} onChange={(e) => set(l, 'altText', e.target.value)} aria-describedby={`${prefix}-${l}-alt-hint`} />
              </AField>
            </div>
          </details>
        ))}
        <AField id={`${prefix}-doc`} label="Документ каталога (идентификатор, необязательно)" hint="На сайте ссылка появится, только если документ опубликован и не закрыт">
          <input id={`${prefix}-doc`} className="input" value={documentId} onChange={(e) => setDocumentId(e.target.value)} aria-describedby={`${prefix}-doc-hint`} />
        </AField>
        {item?.documentTitle ? <p className="self-center text-sm">Связан: {item.documentTitle}</p> : null}
      </fieldset>
      {item?.image ? (
        <p className="my-2 text-sm">
          Изображение: {item.image.filename} ·{' '}
          {item.image.antivirusStatus === 'clean' ? 'проверено, показывается на сайте' : 'ожидает антивирусной проверки, на сайте пока не показывается'}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        {editable ? <button type="submit" className="btn-primary" disabled={busy}>{item ? 'Сохранить экспонат' : 'Добавить экспонат'}</button> : null}
        {item && editable && canUpload ? (
          <div className="admin-field mb-0">
            <label htmlFor={`${prefix}-image`}>Изображение (JPEG, PNG, WebP, до 20 МБ)</label>
            <input
              id={`${prefix}-image`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="input"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void run(() => adminUpload(`/admin/exhibitions/${exhibitionId}/items/${item.id}/image`, file).then(() => undefined), 'Изображение загружено и ожидает проверки антивирусом.');
              }}
            />
          </div>
        ) : null}
        {item && editable ? <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirmDelete(true)}>Удалить экспонат</button> : null}
      </div>
      {item ? (
        <ConfirmDialog
          open={confirmDelete}
          danger
          title={`Удалить экспонат ${item.number}?`}
          description="Экспонат и его тексты будут удалены из выставки."
          confirmLabel="Удалить"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void run(() => adminRequest('DELETE', `/admin/exhibitions/${exhibitionId}/items/${item.id}`, { confirm: true }), 'Экспонат удалён.');
          }}
        />
      ) : null}
    </form>
  );
}

function AField({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      {hint ? <span id={`${id}-hint`} className="hint">{hint}</span> : null}
      {children}
    </div>
  );
}
