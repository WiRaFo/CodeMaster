import { useState, type FormEvent } from 'react';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { ADMIN_LOCALES, type AdminLocale } from './format.ts';
import {
  Field, MemoryTabs, OriginSelect, SaveButtons, byLocale, filled, useMemoryPage,
  type EventRow, type Origin, type PersonRow, type Texts,
} from './MemoryAdmin.tsx';
import { useAdminData } from './useAdminData.ts';

/**
 * Публикации «Цифровой истории» в панели (ТЗ §5.6, §6.6; F-149). Черновик сохраняет сотрудник с publications:edit,
 * публикует, правит опубликованное и удаляет — с publications:publish. К публикации привязываются тематики,
 * населённые пункты, документ каталога, личности и события хронологии; на сайте видно только опубликованное.
 */
const KINDS: Record<string, string> = { article: 'Статья', photo_story: 'Фотоистория', biography: 'Биография', memoir: 'Воспоминания' };
const MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: 'Проверьте поля: адрес латиницей, название и текст на русском, источник от 5 символов, годы по порядку, ссылка на источник с https.',
  FORBIDDEN: 'Публиковать, править опубликованное и удалять может сотрудник с правом публикации. Сохраните как черновик.',
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface PubText { title: string; lead: string; bodyText: string }
interface Option { slug: string; name: string }
interface PubRow {
  id: string; slug: string; kind: string; periodText: string | null; yearFrom: number | null; yearTo: number | null;
  published: boolean; featured: boolean; publishedAt: string | null; dataOrigin: string; sourceNote: string | null; authorship: string | null; sourceUrl: string | null;
  document: { id: string; title: string | null; visible: boolean } | null;
  topics: string[]; settlements: string[]; personIds: string[]; eventIds: string[];
  updatedAt: string; title: string; translations: Partial<Record<AdminLocale, PubText>>;
}
interface PubList { items: PubRow[]; kinds: string[]; topics: Option[]; settlements: Option[]; canPublish: boolean }
interface PubForm {
  slug: string; kind: string; periodText: string; yearFrom: string; yearTo: string; published: boolean; featured: boolean;
  dataOrigin: Origin; sourceNote: string; authorship: string; sourceUrl: string; documentLink: string;
  topics: string[]; settlements: string[]; personIds: string[]; eventIds: string[]; texts: Texts<PubText>;
}
const emptyText = (): PubText => ({ title: '', lead: '', bodyText: '' });
const toggle = (list: string[], value: string, on: boolean) => (on ? [...list, value] : list.filter((x) => x !== value));

function formOf(row: PubRow | null): PubForm {
  if (!row) {
    return {
      slug: '', kind: 'article', periodText: '', yearFrom: '', yearTo: '', published: false, featured: false, dataOrigin: 'verified',
      sourceNote: '', authorship: '', sourceUrl: '', documentLink: '', topics: [], settlements: [], personIds: [], eventIds: [], texts: byLocale(emptyText),
    };
  }
  return {
    slug: row.slug, kind: row.kind, periodText: row.periodText ?? '', yearFrom: row.yearFrom ? String(row.yearFrom) : '', yearTo: row.yearTo ? String(row.yearTo) : '',
    published: row.published, featured: row.featured, dataOrigin: row.dataOrigin === 'demo' ? 'demo' : 'verified',
    sourceNote: row.sourceNote ?? '', authorship: row.authorship ?? '', sourceUrl: row.sourceUrl ?? '', documentLink: row.document?.id ?? '',
    topics: row.topics, settlements: row.settlements, personIds: row.personIds, eventIds: row.eventIds, texts: byLocale(emptyText, row.translations),
  };
}

/** Набор флажков для связей; длинный список прокручивается внутри рамки. */
function Checklist({ legend, options, value, onChange }: { legend: string; options: Array<{ value: string; label: string }>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="font-semibold">{`${legend} (выбрано: ${value.length})`}</legend>
      {options.length === 0 ? <p>Пока нечего выбрать.</p> : (
        <div className="grid max-h-60 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
          {options.map((o) => (
            <label key={o.value} className="choice"><input type="checkbox" checked={value.includes(o.value)} onChange={(e) => onChange(toggle(value, o.value, e.target.checked))} /><span>{o.label}</span></label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export function MemoryPublicationsPage({ canWrite }: { canWrite: boolean }) {
  const list = useAdminData<PubList>('/admin/memory/publications');
  const persons = useAdminData<{ items: PersonRow[] }>('/admin/memory/persons');
  const events = useAdminData<{ items: EventRow[] }>('/admin/memory/events');
  const page = useMemoryPage('/admin/memory/publications', list.reload, MESSAGES);
  const [editing, setEditing] = useState<{ id: string | null; updatedAt: string | null; current: PubRow | null; form: PubForm } | null>(null);
  const canPublish = list.data?.canPublish ?? false;
  const set = (patch: Partial<PubForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const setText = (l: AdminLocale, k: keyof PubText, v: string) => editing && set({ texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } });
  const open = (row: PubRow | null) => {
    page.setStatus(null);
    page.setError(null);
    setEditing({ id: row?.id ?? null, updatedAt: row?.updatedAt ?? null, current: row, form: formOf(row) });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const f = editing.form;
    const documentId = f.documentLink.trim() ? (UUID.exec(f.documentLink)?.[0] ?? f.documentLink.trim()) : '';
    const body = {
      slug: f.slug, kind: f.kind, periodText: f.periodText, yearFrom: f.yearFrom, yearTo: f.yearTo, published: f.published, featured: f.featured,
      dataOrigin: f.dataOrigin, sourceNote: f.sourceNote, authorship: f.authorship, sourceUrl: f.sourceUrl, documentId,
      topics: f.topics, settlements: f.settlements, personIds: f.personIds, eventIds: f.eventIds, translations: filled(f.texts, 'title'),
    };
    if (await page.save(editing.id, editing.updatedAt, body, f.published ? 'Публикация сохранена и видна на сайте.' : 'Публикация сохранена как черновик.')) setEditing(null);
  };
  // Опубликованное правит только сотрудник с правом публикации.
  const canEdit = (row: PubRow) => canWrite && (canPublish || !row.published);
  const doc = editing?.current?.document;
  const docChanged = editing ? editing.form.documentLink.trim() !== (doc?.id ?? '') : false;

  return (
    <>
      <AdminHeading title="Архив памяти: публикации">
        {canWrite && !editing ? <button type="button" className="btn-primary" onClick={() => open(null)}>Добавить публикацию</button> : null}
      </AdminHeading>
      <MemoryTabs />
      <p className="mb-4 max-w-3xl">Публикации раздела «Цифровая история». Текст пишется абзацами через пустую строку, без оформления. Источник обязателен.{canPublish ? null : ' Вы можете сохранять черновики; публикует сотрудник с правом публикации.'}</p>
      <p role="status" className="mb-2">{page.status}</p>
      <ErrorMessage error={list.error ?? (editing ? null : page.error)} />
      {editing && list.data ? (
        <form aria-label={editing.id ? 'Правка публикации' : 'Новая публикация'} onSubmit={(e) => void submit(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{editing.id ? 'Правка публикации' : 'Новая публикация'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="pu-slug" label="Адрес" hint="Латиница, цифры и дефис."><input id="pu-slug" className="input" aria-describedby="pu-slug-hint" value={editing.form.slug} onChange={(e) => set({ slug: e.target.value })} /></Field>
            <Field id="pu-kind" label="Вид">
              <select id="pu-kind" className="input" value={editing.form.kind} onChange={(e) => set({ kind: e.target.value })}>
                {list.data.kinds.map((k) => <option key={k} value={k}>{KINDS[k] ?? k}</option>)}
              </select>
            </Field>
            <Field id="pu-from" label="Год начала периода"><input id="pu-from" className="input" inputMode="numeric" maxLength={4} value={editing.form.yearFrom} onChange={(e) => set({ yearFrom: e.target.value })} /></Field>
            <Field id="pu-to" label="Год окончания периода"><input id="pu-to" className="input" inputMode="numeric" maxLength={4} value={editing.form.yearTo} onChange={(e) => set({ yearTo: e.target.value })} /></Field>
            <Field id="pu-period" label="Период словами" hint="Если годы неточны, например «1920-е годы»."><input id="pu-period" className="input" aria-describedby="pu-period-hint" value={editing.form.periodText} onChange={(e) => set({ periodText: e.target.value })} /></Field>
            <OriginSelect id="pu-origin" value={editing.form.dataOrigin} onChange={(dataOrigin) => set({ dataOrigin })} />
          </div>
          <Field id="pu-source" label="Источник"><input id="pu-source" className="input" value={editing.form.sourceNote} onChange={(e) => set({ sourceNote: e.target.value })} /></Field>
          <Field id="pu-author" label="Автор или составитель"><input id="pu-author" className="input" value={editing.form.authorship} onChange={(e) => set({ authorship: e.target.value })} /></Field>
          <Field id="pu-url" label="Ссылка на источник" hint="Только https."><input id="pu-url" className="input" type="url" aria-describedby="pu-url-hint" value={editing.form.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} /></Field>
          <Field id="pu-doc" label="Документ каталога" hint="Ссылка на карточку документа на сайте или его идентификатор. Пусто — без документа.">
            <input id="pu-doc" className="input" aria-describedby="pu-doc-hint" value={editing.form.documentLink} onChange={(e) => set({ documentLink: e.target.value })} />
          </Field>
          {doc && !docChanged ? <p>{`Сейчас: ${doc.title ?? doc.id}`}{doc.visible ? null : <strong> (не видно на сайте: документ закрыт или не опубликован)</strong>}</p> : null}
          <label className="choice"><input type="checkbox" checked={editing.form.published} disabled={!canPublish} onChange={(e) => set({ published: e.target.checked })} /><span>Опубликовано на сайте</span></label>
          <label className="choice"><input type="checkbox" checked={editing.form.featured} onChange={(e) => set({ featured: e.target.checked })} /><span>Показывать в начале списка</span></label>
          <Checklist legend="Тематики" options={list.data.topics.map((x) => ({ value: x.slug, label: x.name }))} value={editing.form.topics} onChange={(topics) => set({ topics })} />
          <Checklist legend="Населённые пункты" options={list.data.settlements.map((x) => ({ value: x.slug, label: x.name }))} value={editing.form.settlements} onChange={(settlements) => set({ settlements })} />
          <Checklist
            legend="Личности"
            options={(persons.data?.items ?? []).map((p) => ({ value: p.id, label: p.published ? p.fullName : `${p.fullName} (не опубликована)` }))}
            value={editing.form.personIds}
            onChange={(personIds) => set({ personIds })}
          />
          <Checklist
            legend="События хронологии"
            options={(events.data?.items ?? []).map((e) => ({ value: e.id, label: `${e.year}: ${e.title}${e.published ? '' : ' (черновик)'}` }))}
            value={editing.form.eventIds}
            onChange={(eventIds) => set({ eventIds })}
          />
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="flex flex-col gap-2">
              <legend className="font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ' (пусто — без этой версии)'}</legend>
              <Field id={`pu-${l.code}-title`} label="Заголовок"><input id={`pu-${l.code}-title`} className="input" lang={l.code} value={editing.form.texts[l.code].title} onChange={(e) => setText(l.code, 'title', e.target.value)} /></Field>
              <Field id={`pu-${l.code}-lead`} label="Вводный абзац"><textarea id={`pu-${l.code}-lead`} className="input min-h-16" lang={l.code} value={editing.form.texts[l.code].lead} onChange={(e) => setText(l.code, 'lead', e.target.value)} /></Field>
              <Field id={`pu-${l.code}-body`} label="Текст"><textarea id={`pu-${l.code}-body`} className="input min-h-48" lang={l.code} value={editing.form.texts[l.code].bodyText} onChange={(e) => setText(l.code, 'bodyText', e.target.value)} /></Field>
            </fieldset>
          ))}
          <ErrorMessage error={page.error} />
          <SaveButtons onCancel={() => { setEditing(null); page.setError(null); }} />
        </form>
      ) : null}
      {list.data ? (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th scope="col">Публикация</th><th scope="col">Вид</th><th scope="col">Связи</th><th scope="col">Состояние</th><th scope="col"><span className="visually-hidden">Действия</span></th></tr></thead>
            <tbody>
              {list.data.items.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}{p.dataOrigin === 'demo' ? <span className="text-sm text-muted"> (демо)</span> : null}</td>
                  <td>{KINDS[p.kind] ?? p.kind}</td>
                  <td>{`личностей: ${p.personIds.length}, событий: ${p.eventIds.length}${p.document ? ', документ' : ''}`}</td>
                  <td>{p.published ? 'На сайте' : p.publishedAt ? 'Снята с сайта' : 'Черновик'}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {canEdit(p) ? <button type="button" className="btn-secondary" aria-label={`Изменить: ${p.title}`} onClick={() => open(p)}>Изменить</button> : null}
                      {canWrite && canPublish ? <button type="button" className="btn-secondary" aria-label={`Удалить: ${p.title}`} onClick={() => page.askDelete({ id: p.id, label: p.title })}>Удалить</button> : null}
                    </div>
                  </td>
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
