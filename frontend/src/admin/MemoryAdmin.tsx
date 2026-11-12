import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { AdminApiError, adminRequest, errorText } from './api.ts';
import { ADMIN_LOCALES, type AdminLocale } from './format.ts';
import { useAdminData } from './useAdminData.ts';

/**
 * «Архив памяти» в панели (ТЗ §6.6, F-149): события хронологии, исторические личности, коллекции.
 * Читать может сотрудник с publications:edit, сохранять и удалять — с publications:publish: запись меняется
 * на сайте сразу. У каждой записи обязателен источник; демонстрационные помечаются на сайте.
 */
type Origin = 'verified' | 'demo';
type Texts<T> = Record<AdminLocale, T>;
const ERRORS: Record<string, string> = {
  VALIDATION_FAILED: 'Проверьте поля: адрес латиницей через дефис, название на русском, источник от 5 символов, годы по порядку.',
  CONFLICT: 'Такой адрес уже занят, или запись изменена другим сотрудником: обновите страницу.',
  FORBIDDEN: 'Недостаточно прав: сохранять записи «Архива памяти» может сотрудник с правом публикации.',
};
const failText = (e: unknown) => (e instanceof AdminApiError ? (ERRORS[e.code] ?? errorText(e)) : errorText(e));
const byLocale = <T,>(make: () => T, from: Partial<Record<AdminLocale, T>> = {}): Texts<T> =>
  Object.fromEntries(ADMIN_LOCALES.map((l) => [l.code, from[l.code] ?? make()])) as Texts<T>;
const filled = <T, K extends keyof T>(texts: Texts<T>, key: K) =>
  Object.fromEntries(ADMIN_LOCALES.filter((l) => String(texts[l.code][key]).trim()).map((l) => [l.code, texts[l.code]]));

/** Переключатель разделов «Архива памяти». */
function MemoryTabs() {
  const tabs = [['/admin/memory/events', 'Хронология'], ['/admin/memory/persons', 'Личности'], ['/admin/memory/collections', 'Коллекции']] as const;
  return (
    <nav aria-label="Разделы архива памяти" className="mb-4">
      <ul className="flex flex-wrap gap-2">
        {tabs.map(([to, label]) => (
          <li key={to}><NavLink to={to} className={({ isActive }) => (isActive ? 'btn-primary' : 'btn-secondary')}>{label}</NavLink></li>
        ))}
      </ul>
    </nav>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>{label}</label>
      {hint ? <p id={`${id}-hint`} className="hint">{hint}</p> : null}
      {children}
    </div>
  );
}

function OriginSelect({ id, value, onChange }: { id: string; value: Origin; onChange: (v: Origin) => void }) {
  return (
    <Field id={id} label="Происхождение">
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value === 'demo' ? 'demo' : 'verified')}>
        <option value="verified">Сведения архива</option>
        <option value="demo">Демонстрационная</option>
      </select>
    </Field>
  );
}

/** Общая обвязка списка: заголовок, кнопка «Добавить», статус, ошибка, подтверждение удаления. */
function useMemoryPage(base: string, reload: () => void) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);
  const save = async (id: string | null, updatedAt: string | null, body: unknown, done: string) => {
    setError(null);
    try {
      await adminRequest(id ? 'PUT' : 'POST', id ? `${base}/${id}` : base, body, updatedAt ? { 'If-Match': updatedAt } : {});
      setStatus(done);
      reload();
      return true;
    } catch (e) {
      setError(failText(e));
      return false;
    }
  };
  const remove = async () => {
    if (!deleting) return;
    try {
      await adminRequest('DELETE', `${base}/${deleting.id}`, { confirm: true });
      setStatus(`«${deleting.label}» удалено.`);
      reload();
    } catch (e) {
      setError(failText(e));
    } finally {
      setDeleting(null);
    }
  };
  const dialog = (
    <ConfirmDialog
      open={deleting !== null}
      title="Удалить запись?"
      description={`«${deleting?.label ?? ''}» исчезнет из панели и с сайта. Действие нельзя отменить.`}
      confirmLabel="Удалить"
      danger
      onConfirm={() => void remove()}
      onCancel={() => setDeleting(null)}
    />
  );
  return { status, setStatus, error, setError, save, askDelete: setDeleting, dialog };
}

function Actions({ canWrite, label, onEdit, onDelete }: { canWrite: boolean; label: string; onEdit: () => void; onDelete: () => void }) {
  if (!canWrite) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary" aria-label={`Изменить: ${label}`} onClick={onEdit}>Изменить</button>
      <button type="button" className="btn-secondary" aria-label={`Удалить: ${label}`} onClick={onDelete}>Удалить</button>
    </div>
  );
}

const SaveButtons = ({ onCancel }: { onCancel: () => void }) => (
  <div className="flex flex-wrap gap-2">
    <button type="submit" className="btn-primary">Сохранить</button>
    <button type="button" className="btn-secondary" onClick={onCancel}>Отмена</button>
  </div>
);

/* ---------- Хронология ---------- */

interface EventText { title: string; description: string }
interface EventRow { id: string; slug: string; year: number; date: string | null; published: boolean; dataOrigin: string; sourceNote: string | null; updatedAt: string; title: string; translations: Partial<Record<AdminLocale, EventText>> }
interface EventForm { slug: string; year: string; date: string; published: boolean; dataOrigin: Origin; sourceNote: string; texts: Texts<EventText> }
const emptyEventText = (): EventText => ({ title: '', description: '' });

export function MemoryEventsPage({ canWrite }: { canWrite: boolean }) {
  const list = useAdminData<{ items: EventRow[] }>('/admin/memory/events');
  const page = useMemoryPage('/admin/memory/events', list.reload);
  const [editing, setEditing] = useState<{ id: string | null; updatedAt: string | null; form: EventForm } | null>(null);
  const set = (patch: Partial<EventForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const setText = (l: AdminLocale, k: keyof EventText, v: string) => editing && set({ texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } });
  const open = (row: EventRow | null) => {
    page.setStatus(null);
    page.setError(null);
    setEditing(row
      ? { id: row.id, updatedAt: row.updatedAt, form: { slug: row.slug, year: String(row.year), date: row.date ?? '', published: row.published, dataOrigin: row.dataOrigin === 'demo' ? 'demo' : 'verified', sourceNote: row.sourceNote ?? '', texts: byLocale(emptyEventText, row.translations) } }
      : { id: null, updatedAt: null, form: { slug: '', year: '', date: '', published: false, dataOrigin: 'verified', sourceNote: '', texts: byLocale(emptyEventText) } });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const f = editing.form;
    const body = { slug: f.slug, year: f.year, date: f.date, published: f.published, dataOrigin: f.dataOrigin, sourceNote: f.sourceNote, translations: filled(f.texts, 'title') };
    if (await page.save(editing.id, editing.updatedAt, body, 'Событие сохранено.')) setEditing(null);
  };

  return (
    <>
      <AdminHeading title="Архив памяти: хронология">
        {canWrite && !editing ? <button type="button" className="btn-primary" onClick={() => open(null)}>Добавить событие</button> : null}
      </AdminHeading>
      <MemoryTabs />
      <p className="mb-4 max-w-3xl">События показываются на странице «Хронология» по годам. Укажите источник: документ, текст архива или издание.</p>
      <p role="status" className="mb-2">{page.status}</p>
      <ErrorMessage error={list.error ?? (editing ? null : page.error)} />
      {editing ? (
        <form aria-label={editing.id ? 'Правка события' : 'Новое событие'} onSubmit={(e) => void submit(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{editing.id ? 'Правка события' : 'Новое событие'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ev-slug" label="Адрес" hint="Латиница, цифры и дефис."><input id="ev-slug" className="input" aria-describedby="ev-slug-hint" value={editing.form.slug} onChange={(e) => set({ slug: e.target.value })} /></Field>
            <Field id="ev-year" label="Год"><input id="ev-year" className="input" inputMode="numeric" maxLength={4} value={editing.form.year} onChange={(e) => set({ year: e.target.value })} /></Field>
            <Field id="ev-date" label="Точная дата (если известна)"><input id="ev-date" className="input" type="date" value={editing.form.date} onChange={(e) => set({ date: e.target.value })} /></Field>
            <OriginSelect id="ev-origin" value={editing.form.dataOrigin} onChange={(dataOrigin) => set({ dataOrigin })} />
          </div>
          <Field id="ev-source" label="Источник"><input id="ev-source" className="input" value={editing.form.sourceNote} onChange={(e) => set({ sourceNote: e.target.value })} /></Field>
          <label className="choice"><input type="checkbox" checked={editing.form.published} onChange={(e) => set({ published: e.target.checked })} /><span>Опубликовано на сайте</span></label>
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="flex flex-col gap-2">
              <legend className="font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ' (пусто — без этой версии)'}</legend>
              <Field id={`ev-${l.code}-title`} label="Название"><input id={`ev-${l.code}-title`} className="input" lang={l.code} value={editing.form.texts[l.code].title} onChange={(e) => setText(l.code, 'title', e.target.value)} /></Field>
              <Field id={`ev-${l.code}-desc`} label="Описание"><textarea id={`ev-${l.code}-desc`} className="input min-h-32" lang={l.code} value={editing.form.texts[l.code].description} onChange={(e) => setText(l.code, 'description', e.target.value)} /></Field>
            </fieldset>
          ))}
          <ErrorMessage error={page.error} />
          <SaveButtons onCancel={() => { setEditing(null); page.setError(null); }} />
        </form>
      ) : null}
      {list.data ? (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th scope="col">Год</th><th scope="col">Событие</th><th scope="col">Состояние</th><th scope="col"><span className="visually-hidden">Действия</span></th></tr></thead>
            <tbody>
              {list.data.items.map((e) => (
                <tr key={e.id}>
                  <td>{e.date ?? e.year}</td>
                  <td>{e.title}{e.dataOrigin === 'demo' ? <span className="text-sm text-muted"> (демо)</span> : null}</td>
                  <td>{e.published ? 'На сайте' : 'Черновик'}</td>
                  <td><Actions canWrite={canWrite} label={e.title} onEdit={() => open(e)} onDelete={() => page.askDelete({ id: e.id, label: e.title })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {page.dialog}
    </>
  );
}

/* ---------- Личности ---------- */

interface PersonText { fullName: string; biography: string }
interface PersonRow { id: string; slug: string; birthYear: number | null; deathYear: number | null; published: boolean; dataOrigin: string; sourceNote: string | null; updatedAt: string; fullName: string; memorableDates: number; translations: Partial<Record<AdminLocale, PersonText>> }
interface PersonForm { slug: string; birthYear: string; deathYear: string; published: boolean; dataOrigin: Origin; sourceNote: string; texts: Texts<PersonText> }
const emptyPersonText = (): PersonText => ({ fullName: '', biography: '' });
const years = (p: PersonRow) => (p.birthYear || p.deathYear ? `${p.birthYear ?? '?'}–${p.deathYear ?? ''}` : 'нет');

export function MemoryPersonsPage({ canWrite }: { canWrite: boolean }) {
  const list = useAdminData<{ items: PersonRow[] }>('/admin/memory/persons');
  const page = useMemoryPage('/admin/memory/persons', list.reload);
  const [editing, setEditing] = useState<{ id: string | null; updatedAt: string | null; form: PersonForm } | null>(null);
  const set = (patch: Partial<PersonForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const setText = (l: AdminLocale, k: keyof PersonText, v: string) => editing && set({ texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } });
  const open = (row: PersonRow | null) => {
    page.setStatus(null);
    page.setError(null);
    setEditing(row
      ? { id: row.id, updatedAt: row.updatedAt, form: { slug: row.slug, birthYear: row.birthYear?.toString() ?? '', deathYear: row.deathYear?.toString() ?? '', published: row.published, dataOrigin: row.dataOrigin === 'demo' ? 'demo' : 'verified', sourceNote: row.sourceNote ?? '', texts: byLocale(emptyPersonText, row.translations) } }
      : { id: null, updatedAt: null, form: { slug: '', birthYear: '', deathYear: '', published: false, dataOrigin: 'verified', sourceNote: '', texts: byLocale(emptyPersonText) } });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const f = editing.form;
    const body = { slug: f.slug, birthYear: f.birthYear, deathYear: f.deathYear, published: f.published, dataOrigin: f.dataOrigin, sourceNote: f.sourceNote, translations: filled(f.texts, 'fullName') };
    if (await page.save(editing.id, editing.updatedAt, body, 'Личность сохранена.')) setEditing(null);
  };

  return (
    <>
      <AdminHeading title="Архив памяти: личности">
        {canWrite && !editing ? <button type="button" className="btn-primary" onClick={() => open(null)}>Добавить личность</button> : null}
      </AdminHeading>
      <MemoryTabs />
      <p className="mb-4 max-w-3xl">Биография пишется абзацами через пустую строку. Записи календаря памятных дат привязываются к личности автоматически при загрузке календаря.</p>
      <p role="status" className="mb-2">{page.status}</p>
      <ErrorMessage error={list.error ?? (editing ? null : page.error)} />
      {editing ? (
        <form aria-label={editing.id ? 'Правка личности' : 'Новая личность'} onSubmit={(e) => void submit(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{editing.id ? 'Правка личности' : 'Новая личность'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pe-slug" label="Адрес" hint="Латиница, цифры и дефис."><input id="pe-slug" className="input" aria-describedby="pe-slug-hint" value={editing.form.slug} onChange={(e) => set({ slug: e.target.value })} /></Field>
            <OriginSelect id="pe-origin" value={editing.form.dataOrigin} onChange={(dataOrigin) => set({ dataOrigin })} />
            <Field id="pe-birth" label="Год рождения"><input id="pe-birth" className="input" inputMode="numeric" maxLength={4} value={editing.form.birthYear} onChange={(e) => set({ birthYear: e.target.value })} /></Field>
            <Field id="pe-death" label="Год смерти"><input id="pe-death" className="input" inputMode="numeric" maxLength={4} value={editing.form.deathYear} onChange={(e) => set({ deathYear: e.target.value })} /></Field>
          </div>
          <Field id="pe-source" label="Источник"><input id="pe-source" className="input" value={editing.form.sourceNote} onChange={(e) => set({ sourceNote: e.target.value })} /></Field>
          <label className="choice"><input type="checkbox" checked={editing.form.published} onChange={(e) => set({ published: e.target.checked })} /><span>Опубликовано на сайте</span></label>
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="flex flex-col gap-2">
              <legend className="font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ' (пусто — без этой версии)'}</legend>
              <Field id={`pe-${l.code}-name`} label="Полное имя"><input id={`pe-${l.code}-name`} className="input" lang={l.code} value={editing.form.texts[l.code].fullName} onChange={(e) => setText(l.code, 'fullName', e.target.value)} /></Field>
              <Field id={`pe-${l.code}-bio`} label="Биография"><textarea id={`pe-${l.code}-bio`} className="input min-h-40" lang={l.code} value={editing.form.texts[l.code].biography} onChange={(e) => setText(l.code, 'biography', e.target.value)} /></Field>
            </fieldset>
          ))}
          <ErrorMessage error={page.error} />
          <SaveButtons onCancel={() => { setEditing(null); page.setError(null); }} />
        </form>
      ) : null}
      {list.data ? (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th scope="col">Имя</th><th scope="col">Годы жизни</th><th scope="col">Записей календаря</th><th scope="col">Состояние</th><th scope="col"><span className="visually-hidden">Действия</span></th></tr></thead>
            <tbody>
              {list.data.items.map((p) => (
                <tr key={p.id}>
                  <td>{p.fullName}{p.dataOrigin === 'demo' ? <span className="text-sm text-muted"> (демо)</span> : null}</td>
                  <td>{years(p)}</td>
                  <td>{p.memorableDates}</td>
                  <td>{p.published ? 'На сайте' : 'Черновик'}</td>
                  <td><Actions canWrite={canWrite} label={p.fullName} onEdit={() => open(p)} onDelete={() => page.askDelete({ id: p.id, label: p.fullName })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {page.dialog}
    </>
  );
}

/* ---------- Коллекции ---------- */

interface CollectionText { title: string; description: string }
interface Item { type: 'document' | 'person'; id: string; label: string | null; visible: boolean }
interface CollectionRow { id: string; slug: string; featured: boolean; sortOrder: number; published: boolean; dataOrigin: string; updatedAt: string; title: string; translations: Partial<Record<AdminLocale, CollectionText>>; items: Item[] }
interface CollectionForm { slug: string; featured: boolean; sortOrder: string; published: boolean; dataOrigin: Origin; texts: Texts<CollectionText>; items: Item[] }
const emptyCollectionText = (): CollectionText => ({ title: '', description: '' });
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function MemoryCollectionsPage({ canWrite }: { canWrite: boolean }) {
  const list = useAdminData<{ items: CollectionRow[] }>('/admin/memory/collections');
  const persons = useAdminData<{ items: PersonRow[] }>('/admin/memory/persons');
  const page = useMemoryPage('/admin/memory/collections', list.reload);
  const [editing, setEditing] = useState<{ id: string | null; updatedAt: string | null; form: CollectionForm } | null>(null);
  const [docLink, setDocLink] = useState('');
  const [personId, setPersonId] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const set = (patch: Partial<CollectionForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const setText = (l: AdminLocale, k: keyof CollectionText, v: string) => editing && set({ texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } });
  const open = (row: CollectionRow | null) => {
    page.setStatus(null);
    page.setError(null);
    setItemError(null);
    setEditing(row
      ? { id: row.id, updatedAt: row.updatedAt, form: { slug: row.slug, featured: row.featured, sortOrder: String(row.sortOrder), published: row.published, dataOrigin: row.dataOrigin === 'demo' ? 'demo' : 'verified', texts: byLocale(emptyCollectionText, row.translations), items: row.items } }
      : { id: null, updatedAt: null, form: { slug: '', featured: false, sortOrder: '0', published: false, dataOrigin: 'verified', texts: byLocale(emptyCollectionText), items: [] } });
  };
  const addItem = (item: Item) => {
    if (!editing) return;
    if (editing.form.items.some((i) => i.type === item.type && i.id === item.id)) return setItemError('Этот элемент уже в коллекции.');
    setItemError(null);
    set({ items: [...editing.form.items, item] });
  };
  const addDocument = () => {
    const id = UUID.exec(docLink)?.[0];
    if (!id) return setItemError('Вставьте ссылку на карточку документа на сайте или его идентификатор.');
    addItem({ type: 'document', id: id.toLowerCase(), label: null, visible: true });
    setDocLink('');
  };
  const addPerson = () => {
    const p = persons.data?.items.find((x) => x.id === personId);
    if (p) addItem({ type: 'person', id: p.id, label: p.fullName, visible: p.published });
  };
  const move = (index: number, delta: number) => {
    if (!editing) return;
    const items = [...editing.form.items];
    const [it] = items.splice(index, 1);
    if (it) items.splice(index + delta, 0, it);
    set({ items });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const f = editing.form;
    const body = { slug: f.slug, featured: f.featured, sortOrder: f.sortOrder, published: f.published, dataOrigin: f.dataOrigin, translations: filled(f.texts, 'title'), items: f.items.map(({ type, id }) => ({ type, id })) };
    if (await page.save(editing.id, editing.updatedAt, body, 'Коллекция сохранена.')) setEditing(null);
  };
  const itemLabel = (i: Item) => `${i.type === 'document' ? 'Документ' : 'Личность'}: ${i.label ?? i.id}`;

  return (
    <>
      <AdminHeading title="Архив памяти: коллекции">
        {canWrite && !editing ? <button type="button" className="btn-primary" onClick={() => open(null)}>Добавить коллекцию</button> : null}
      </AdminHeading>
      <MemoryTabs />
      <p className="mb-4 max-w-3xl">Коллекция собирает документы каталога и личностей. Закрытые и неопубликованные документы можно оставить в коллекции, но сайт их не покажет.</p>
      <p role="status" className="mb-2">{page.status}</p>
      <ErrorMessage error={list.error ?? (editing ? null : page.error)} />
      {editing ? (
        <form aria-label={editing.id ? 'Правка коллекции' : 'Новая коллекция'} onSubmit={(e) => void submit(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{editing.id ? 'Правка коллекции' : 'Новая коллекция'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="co-slug" label="Адрес" hint="Латиница, цифры и дефис."><input id="co-slug" className="input" aria-describedby="co-slug-hint" value={editing.form.slug} onChange={(e) => set({ slug: e.target.value })} /></Field>
            <OriginSelect id="co-origin" value={editing.form.dataOrigin} onChange={(dataOrigin) => set({ dataOrigin })} />
            <Field id="co-order" label="Порядок в списке"><input id="co-order" className="input" inputMode="numeric" value={editing.form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} /></Field>
          </div>
          <label className="choice"><input type="checkbox" checked={editing.form.published} onChange={(e) => set({ published: e.target.checked })} /><span>Опубликовано на сайте</span></label>
          <label className="choice"><input type="checkbox" checked={editing.form.featured} onChange={(e) => set({ featured: e.target.checked })} /><span>Показывать первой</span></label>
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="flex flex-col gap-2">
              <legend className="font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ' (пусто — без этой версии)'}</legend>
              <Field id={`co-${l.code}-title`} label="Название"><input id={`co-${l.code}-title`} className="input" lang={l.code} value={editing.form.texts[l.code].title} onChange={(e) => setText(l.code, 'title', e.target.value)} /></Field>
              <Field id={`co-${l.code}-desc`} label="Описание"><textarea id={`co-${l.code}-desc`} className="input min-h-20" lang={l.code} value={editing.form.texts[l.code].description} onChange={(e) => setText(l.code, 'description', e.target.value)} /></Field>
            </fieldset>
          ))}
          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">Состав ({editing.form.items.length})</legend>
            {editing.form.items.length === 0 ? <p>Элементов пока нет.</p> : (
              <ol className="flex flex-col gap-2">
                {editing.form.items.map((i, n) => (
                  <li key={`${i.type}:${i.id}`} className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
                    <span className="min-w-0 grow">{itemLabel(i)}{i.visible ? null : <strong> (не видно на сайте)</strong>}</span>
                    <button type="button" className="btn-secondary" disabled={n === 0} aria-label={`Выше: ${itemLabel(i)}`} onClick={() => move(n, -1)}>Выше</button>
                    <button type="button" className="btn-secondary" disabled={n === editing.form.items.length - 1} aria-label={`Ниже: ${itemLabel(i)}`} onClick={() => move(n, 1)}>Ниже</button>
                    <button type="button" className="btn-secondary" aria-label={`Убрать: ${itemLabel(i)}`} onClick={() => set({ items: editing.form.items.filter((_, k) => k !== n) })}>Убрать</button>
                  </li>
                ))}
              </ol>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field id="co-doc" label="Документ" hint="Ссылка на карточку документа на сайте или его идентификатор.">
                <input id="co-doc" className="input" aria-describedby="co-doc-hint" value={docLink} onChange={(e) => setDocLink(e.target.value)} />
              </Field>
              <button type="button" className="btn-secondary" onClick={addDocument}>Добавить документ</button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field id="co-person" label="Личность">
                <select id="co-person" className="input" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  <option value="">Выберите</option>
                  {(persons.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                </select>
              </Field>
              <button type="button" className="btn-secondary" onClick={addPerson}>Добавить личность</button>
            </div>
            {itemError ? <p role="alert" className="text-danger">{itemError}</p> : null}
          </fieldset>
          <ErrorMessage error={page.error} />
          <SaveButtons onCancel={() => { setEditing(null); page.setError(null); }} />
        </form>
      ) : null}
      {list.data ? (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th scope="col">Коллекция</th><th scope="col">Элементов</th><th scope="col">Не видно на сайте</th><th scope="col">Состояние</th><th scope="col"><span className="visually-hidden">Действия</span></th></tr></thead>
            <tbody>
              {list.data.items.map((c) => (
                <tr key={c.id}>
                  <td>{c.title}{c.dataOrigin === 'demo' ? <span className="text-sm text-muted"> (демо)</span> : null}</td>
                  <td>{c.items.length}</td>
                  <td>{c.items.filter((i) => !i.visible).length}</td>
                  <td>{c.published ? 'На сайте' : 'Черновик'}</td>
                  <td><Actions canWrite={canWrite} label={c.title} onEdit={() => open(c)} onDelete={() => page.askDelete({ id: c.id, label: c.title })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {page.dialog}
    </>
  );
}
