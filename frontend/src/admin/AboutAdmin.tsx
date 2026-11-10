import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { AdminApiError, adminRequest, adminUpload, errorText } from './api.ts';
import { ADMIN_LOCALES, formatDateTime, type AdminLocale } from './format.ts';
import { Field, OriginSelect, SaveButtons, byLocale, filled, useMemoryPage, type Origin, type Texts } from './MemoryAdmin.tsx';
import { useAdminData } from './useAdminData.ts';

/**
 * «Об архиве» в панели (ТЗ §5.2; F-023, F-021): разделы текста, сотрудники основного архива, ссылки на соцсети
 * и фотогалерея учреждения. Смотреть может сотрудник с pages:edit, сохранять — с pages:publish: изменения сразу
 * видны на сайте. Фото попадает на сайт только после проверки антивирусом и с описанием для незрячих.
 */
interface SectionRow { key: string; title: string; exists: boolean; published: boolean; languages: string[]; updatedAt: string | null }
interface StaffText { fullName: string; position: string; department: string }
interface StaffRow { id: string; phone: string | null; email: string | null; sortOrder: number; published: boolean; dataOrigin: string; updatedAt: string; translations: Partial<Record<AdminLocale, StaffText>> }
interface SocialItem { network: 'instagram' | 'facebook'; label: string; url: string }
interface PhotoText { altText: string; caption: string }
interface PhotoRow { id: string; filename: string; mimeType: string; antivirusStatus: string; dataOrigin: string; translations: Partial<Record<AdminLocale, PhotoText>> }
interface AboutAdmin {
  sections: SectionRow[]; staff: StaffRow[]; hasMainBranch: boolean;
  social: { items: SocialItem[]; updatedAt: string | null }; gallery: PhotoRow[]; canPublish: boolean; canUpload: boolean;
}

const NETWORKS = [{ code: 'instagram', label: 'Instagram' }, { code: 'facebook', label: 'Facebook' }] as const;
const ANTIVIRUS: Record<string, string> = {
  pending: 'ожидает проверки антивирусом, на сайте пока не показывается',
  clean: 'проверено антивирусом',
  infected: 'не прошло проверку антивирусом и на сайте не показывается',
};
const staffName = (s: StaffRow) => s.translations.ru?.fullName ?? s.translations.kk?.fullName ?? s.id;

export function AboutAdminPage() {
  const about = useAdminData<AboutAdmin>('/admin/about');
  const data = about.data;
  return (
    <>
      <AdminHeading title="Об архиве" />
      <p className="mb-4 max-w-3xl">
        Тексты, сотрудники, соцсети и фото страниц <a href="/ru/about">«Об архиве»</a> и <a href="/ru/about/structure">«Структура и руководство»</a>.
        Сохранённое сразу видно на сайте и записывается в журнал.
      </p>
      <ErrorMessage error={about.error} />
      {data ? (
        <>
          {data.canPublish ? null : <p className="mb-4 font-semibold">У вашей роли нет права публиковать: раздел открыт только для просмотра.</p>}
          <SectionsBlock sections={data.sections} />
          <StaffBlock staff={data.staff} canWrite={data.canPublish && data.hasMainBranch} reload={about.reload} />
          <SocialBlock social={data.social} canWrite={data.canPublish} reload={about.reload} />
          <GalleryBlock photos={data.gallery} canWrite={data.canPublish} canUpload={data.canUpload} reload={about.reload} />
        </>
      ) : null}
    </>
  );
}

function SectionsBlock({ sections }: { sections: SectionRow[] }) {
  return (
    <section aria-labelledby="about-sections" className="mb-8">
      <h2 id="about-sections" className="mb-2 text-xl font-semibold">Разделы текста</h2>
      <p className="mb-2 max-w-3xl">Разделы идут на странице в этом порядке. Пустой раздел не показывается; скрытый виден только в панели.</p>
      <table className="admin-table">
        <thead><tr><th scope="col">Раздел</th><th scope="col">Состояние</th><th scope="col">Языки</th><th scope="col">Изменён</th></tr></thead>
        <tbody>
          {sections.map((s) => (
            <tr key={s.key}>
              <td><Link to={`/admin/about/sections/${s.key}`}>{s.title}</Link></td>
              <td>{!s.exists ? 'Не заполнен' : s.published ? 'На сайте' : 'Скрыт'}</td>
              <td>{s.languages.length ? s.languages.map((l) => l.toUpperCase()).join(', ') : 'нет'}</td>
              <td>{s.updatedAt ? formatDateTime(s.updatedAt) : 'нет'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ---------- Правка раздела ---------- */

interface SectionForm { title: string; lead: string; markup: string }
interface SectionDetail { key: string; exists: boolean; published: boolean; updatedAt: string | null; actualizedAt: string | null; translations: Partial<Record<AdminLocale, SectionForm>> }

export function AboutSectionEditPage() {
  const key = useParams()['*'] ?? '';
  const meta = useAdminData<{ canPublish: boolean }>('/admin/about');
  const loaded = useAdminData<SectionDetail>(`/admin/about/sections/${key}`);
  const [forms, setForms] = useState<Texts<SectionForm> | null>(null);
  const [published, setPublished] = useState(false);
  const [actualizedAt, setActualizedAt] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const d = loaded.data;
    if (!d) return;
    setForms(byLocale(() => ({ title: '', lead: '', markup: '' }), d.translations));
    setPublished(d.published);
    setActualizedAt(d.actualizedAt ?? new Date().toISOString().slice(0, 10));
    setUpdatedAt(d.updatedAt);
  }, [loaded.data]);

  if (loaded.error) return <><AdminHeading title="Раздел «Об архиве»" /><ErrorMessage error={loaded.error} /></>;
  if (!forms || !loaded.data || !meta.data) return <p>Загрузка…</p>;
  const readOnly = !meta.data.canPublish;
  const set = (l: AdminLocale, k: keyof SectionForm, v: string) => setForms({ ...forms, [l]: { ...forms[l], [k]: v } });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    try {
      const res = await adminRequest<{ updatedAt: string; changed: string[] }>('PUT', `/admin/about/sections/${key}`,
        { published, actualizedAt, translations: filled(forms, 'title') }, updatedAt ? { 'If-Match': updatedAt } : {});
      setUpdatedAt(res.updatedAt);
      setStatus(`${published ? 'Сохранено, раздел на сайте.' : 'Сохранено, раздел скрыт.'}${res.changed.length ? ` Изменены языки: ${res.changed.map((c) => c.toUpperCase()).join(', ')}.` : ''}`);
    } catch (e) {
      setError(e instanceof AdminApiError && e.code === 'VALIDATION_FAILED'
        ? `Проверьте текст: заголовок и текст на русском обязательны для публикации; ссылки только https. ${e.message}`
        : e instanceof AdminApiError && e.code === 'CONFLICT' ? 'Раздел изменён другим сотрудником: обновите страницу.' : errorText(e));
    }
  };

  return (
    <>
      <AdminHeading title={`Об архиве: ${forms.ru.title || key}`} />
      <p className="mb-4"><Link to="/admin/about">К разделу «Об архиве»</Link></p>
      {readOnly ? <p className="mb-4 font-semibold">У вашей роли нет права публиковать: раздел открыт только для просмотра.</p> : null}
      <details className="mb-4 max-w-3xl rounded border border-border p-3">
        <summary className="cursor-pointer font-semibold">Как оформлять текст</summary>
        <ul className="mt-2 list-disc pl-6">
          <li><code>## Заголовок</code> — подзаголовок внутри раздела.</li>
          <li><code>- пункт</code> или <code>1. пункт</code> — список.</li>
          <li><code>! текст</code> — блок «Ожидаются сведения архива».</li>
          <li><code>[Название](https://адрес) — примечание</code> — внешняя ссылка, только https. Строка, которая начинается с «[», считается ссылкой.</li>
          <li>Пустая строка разделяет абзацы. HTML не поддерживается.</li>
        </ul>
      </details>
      <form aria-label="Правка раздела" onSubmit={(e) => void submit(e)} className="flex max-w-4xl flex-col gap-4">
        <Field id="ab-date" label="Дата актуализации">
          <input id="ab-date" className="input max-w-xs" type="date" value={actualizedAt} readOnly={readOnly} onChange={(e) => setActualizedAt(e.target.value)} />
        </Field>
        {ADMIN_LOCALES.map((l) => (
          <fieldset key={l.code} className="flex flex-col gap-3">
            <legend className="mb-2 text-xl font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ''}</legend>
            <Field id={`ab-${l.code}-title`} label="Заголовок">
              <input id={`ab-${l.code}-title`} className="input" lang={l.code} readOnly={readOnly} value={forms[l.code].title} onChange={(e) => set(l.code, 'title', e.target.value)} />
            </Field>
            <Field id={`ab-${l.code}-lead`} label="Вводный абзац">
              <input id={`ab-${l.code}-lead`} className="input" lang={l.code} readOnly={readOnly} value={forms[l.code].lead} onChange={(e) => set(l.code, 'lead', e.target.value)} />
            </Field>
            <Field id={`ab-${l.code}-markup`} label="Текст раздела">
              <textarea id={`ab-${l.code}-markup`} className="input min-h-64 font-mono" lang={l.code} readOnly={readOnly} value={forms[l.code].markup} onChange={(e) => set(l.code, 'markup', e.target.value)} />
            </Field>
          </fieldset>
        ))}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={published} disabled={readOnly} onChange={(e) => setPublished(e.target.checked)} />
          Показывать на сайте
        </label>
        <ErrorMessage error={error} />
        <p role="status">{status}</p>
        {readOnly ? null : <div><button type="submit" className="btn-primary">Сохранить</button></div>}
      </form>
    </>
  );
}

/* ---------- Сотрудники ---------- */

interface StaffForm { phone: string; email: string; sortOrder: string; published: boolean; dataOrigin: Origin; texts: Texts<StaffText> }
const emptyStaffText = (): StaffText => ({ fullName: '', position: '', department: '' });
const staffForm = (row: StaffRow | null, nextOrder: number): StaffForm => (row
  ? { phone: row.phone ?? '', email: row.email ?? '', sortOrder: String(row.sortOrder), published: row.published, dataOrigin: row.dataOrigin === 'demo' ? 'demo' : 'verified', texts: byLocale(emptyStaffText, row.translations) }
  : { phone: '', email: '', sortOrder: String(nextOrder), published: false, dataOrigin: 'verified', texts: byLocale(emptyStaffText) });

function StaffBlock({ staff, canWrite, reload }: { staff: StaffRow[]; canWrite: boolean; reload: () => void }) {
  const page = useMemoryPage('/admin/about/staff', reload, {
    VALIDATION_FAILED: 'Проверьте поля: ФИО (от 3 символов) и должность на русском, телефон — цифры и + ( ) -, почта в формате имя@домен.',
    CONFLICT: 'Запись изменена другим сотрудником: обновите страницу.',
  });
  const [editing, setEditing] = useState<{ id: string | null; updatedAt: string | null; form: StaffForm } | null>(null);
  const nextOrder = staff.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const f = editing.form;
    const body = { phone: f.phone, email: f.email, sortOrder: Number(f.sortOrder) || 0, published: f.published, dataOrigin: f.dataOrigin, translations: filled(f.texts, 'fullName') };
    if (await page.save(editing.id, editing.updatedAt, body, f.published ? 'Сотрудник сохранён и виден на сайте.' : 'Сотрудник сохранён, на сайте скрыт.')) setEditing(null);
  };
  const setText = (l: AdminLocale, k: keyof StaffText, v: string) => editing && setEditing({ ...editing, form: { ...editing.form, texts: { ...editing.form.texts, [l]: { ...editing.form.texts[l], [k]: v } } } });
  const setForm = (patch: Partial<StaffForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  return (
    <section aria-labelledby="about-staff" className="mb-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 id="about-staff" className="text-xl font-semibold">{`Сотрудники основного архива (${staff.length})`}</h2>
        {canWrite && !editing ? <button type="button" className="btn-primary" onClick={() => { page.setStatus(null); setEditing({ id: null, updatedAt: null, form: staffForm(null, nextOrder) }); }}>Добавить сотрудника</button> : null}
      </div>
      <p className="mb-2 max-w-3xl">Страница «Структура и руководство» группирует сотрудников по отделам. Директора филиалов ведутся на страницах филиалов.</p>
      <p role="status" className="mb-2">{page.status}</p>
      <ErrorMessage error={editing ? null : page.error} />
      {editing ? (
        <form aria-label={editing.id ? 'Правка сотрудника' : 'Новый сотрудник'} onSubmit={(e) => void save(e)} className="mb-6 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h3 className="text-lg font-semibold">{editing.id ? 'Правка сотрудника' : 'Новый сотрудник'}</h3>
          {ADMIN_LOCALES.map((l) => (
            <fieldset key={l.code} className="grid gap-2 sm:grid-cols-3">
              <legend className="mb-1 font-semibold">{l.label}{l.code === 'ru' ? ' (обязательно)' : ''}</legend>
              <Field id={`st-${l.code}-name`} label="ФИО">
                <input id={`st-${l.code}-name`} className="input" lang={l.code} value={editing.form.texts[l.code].fullName} onChange={(e) => setText(l.code, 'fullName', e.target.value)} />
              </Field>
              <Field id={`st-${l.code}-position`} label="Должность">
                <input id={`st-${l.code}-position`} className="input" lang={l.code} value={editing.form.texts[l.code].position} onChange={(e) => setText(l.code, 'position', e.target.value)} />
              </Field>
              <Field id={`st-${l.code}-dept`} label="Отдел">
                <input id={`st-${l.code}-dept`} className="input" lang={l.code} value={editing.form.texts[l.code].department} onChange={(e) => setText(l.code, 'department', e.target.value)} />
              </Field>
            </fieldset>
          ))}
          <div className="grid gap-2 sm:grid-cols-3">
            <Field id="st-phone" label="Телефон"><input id="st-phone" className="input" type="tel" value={editing.form.phone} onChange={(e) => setForm({ phone: e.target.value })} /></Field>
            <Field id="st-email" label="Почта"><input id="st-email" className="input" type="email" value={editing.form.email} onChange={(e) => setForm({ email: e.target.value })} /></Field>
            <Field id="st-order" label="Порядок на странице"><input id="st-order" className="input" inputMode="numeric" value={editing.form.sortOrder} onChange={(e) => setForm({ sortOrder: e.target.value })} /></Field>
          </div>
          <OriginSelect id="st-origin" value={editing.form.dataOrigin} onChange={(v) => setForm({ dataOrigin: v })} />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={editing.form.published} onChange={(e) => setForm({ published: e.target.checked })} />
            Показывать на сайте
          </label>
          <ErrorMessage error={page.error} />
          <SaveButtons onCancel={() => { setEditing(null); page.setError(null); }} />
        </form>
      ) : null}
      {staff.length === 0 ? <p>Сотрудников пока нет.</p> : (
        <table className="admin-table">
          <thead><tr><th scope="col">ФИО</th><th scope="col">Должность и отдел</th><th scope="col">Состояние</th>{canWrite ? <th scope="col">Действия</th> : null}</tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{staffName(s)}</td>
                <td>{[s.translations.ru?.position, s.translations.ru?.department].filter(Boolean).join(', ')}</td>
                <td>{s.published ? 'На сайте' : 'Скрыт'}{s.dataOrigin === 'demo' ? ', демонстрационный' : ''}</td>
                {canWrite ? (
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary" aria-label={`Изменить: ${staffName(s)}`} onClick={() => { page.setStatus(null); page.setError(null); setEditing({ id: s.id, updatedAt: s.updatedAt, form: staffForm(s, nextOrder) }); }}>Изменить</button>
                      <button type="button" className="btn-secondary" aria-label={`Удалить: ${staffName(s)}`} onClick={() => page.askDelete({ id: s.id, label: staffName(s) })}>Удалить</button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {page.dialog}
    </section>
  );
}

/* ---------- Соцсети ---------- */

function SocialBlock({ social, canWrite, reload }: { social: AboutAdmin['social']; canWrite: boolean; reload: () => void }) {
  const initial = () => Object.fromEntries(NETWORKS.map((n) => {
    const item = social.items.find((i) => i.network === n.code);
    return [n.code, { label: item?.label ?? '', url: item?.url ?? '' }];
  })) as Record<SocialItem['network'], { label: string; url: string }>;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);
    const items = NETWORKS.filter((n) => form[n.code].url.trim()).map((n) => ({ network: n.code, label: form[n.code].label.trim(), url: form[n.code].url.trim() }));
    try {
      await adminRequest('PUT', '/admin/about/social', { items }, social.updatedAt ? { 'If-Match': social.updatedAt } : {});
      setStatus('Ссылки на соцсети сохранены.');
      reload();
    } catch (e) {
      setError(e instanceof AdminApiError && e.code === 'VALIDATION_FAILED' ? 'Проверьте ссылки: адрес начинается с https://, подпись от 2 символов.' : errorText(e));
    }
  };
  return (
    <section aria-labelledby="about-social" className="mb-8">
      <h2 id="about-social" className="mb-2 text-xl font-semibold">Соцсети</h2>
      <p className="mb-2 max-w-3xl">Пустой адрес убирает ссылку с сайта.</p>
      <form aria-label="Ссылки на соцсети" onSubmit={(e) => void submit(e)} className="flex max-w-3xl flex-col gap-3">
        {NETWORKS.map((n) => (
          <fieldset key={n.code} className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 font-semibold">{n.label}</legend>
            <Field id={`so-${n.code}-label`} label="Подпись ссылки">
              <input id={`so-${n.code}-label`} className="input" readOnly={!canWrite} value={form[n.code].label} onChange={(e) => setForm({ ...form, [n.code]: { ...form[n.code], label: e.target.value } })} />
            </Field>
            <Field id={`so-${n.code}-url`} label="Адрес страницы">
              <input id={`so-${n.code}-url`} className="input" type="url" readOnly={!canWrite} value={form[n.code].url} onChange={(e) => setForm({ ...form, [n.code]: { ...form[n.code], url: e.target.value } })} />
            </Field>
          </fieldset>
        ))}
        <ErrorMessage error={error} />
        <p role="status">{status}</p>
        {canWrite ? <div><button type="submit" className="btn-primary">Сохранить ссылки</button></div> : null}
      </form>
    </section>
  );
}

/* ---------- Фотогалерея учреждения ---------- */

const emptyPhotoText = (): PhotoText => ({ altText: '', caption: '' });

function GalleryBlock({ photos, canWrite, canUpload, reload }: { photos: PhotoRow[]; canWrite: boolean; canUpload: boolean; reload: () => void }) {
  const [texts, setTexts] = useState<Record<string, Texts<PhotoText>>>({});
  const [origin, setOrigin] = useState<Origin>('verified');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PhotoRow | null>(null);

  // Подписи из сервера для новых фото; уже введённое не затирается.
  useEffect(() => {
    setTexts((prev) => Object.fromEntries(photos.map((p) => [p.id, prev[p.id] ?? byLocale(emptyPhotoText, p.translations)])));
  }, [photos]);

  const call = async (run: () => Promise<unknown>, message: string) => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      await run();
      setStatus(message);
      reload();
    } catch (e) {
      setError(e instanceof AdminApiError && e.code === 'VALIDATION_FAILED' ? 'Описание для незрячих на русском обязательно (от 3 символов).' : errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const upload = async (files: File[]) => {
    for (const file of files) await call(() => adminUpload(`/admin/about/gallery${origin === 'demo' ? '?dataOrigin=demo' : ''}`, file), `Фото «${file.name}» добавлено.`);
  };
  const setText = (id: string, l: AdminLocale, k: keyof PhotoText, v: string) =>
    setTexts((prev) => {
      const cur = prev[id] ?? byLocale(emptyPhotoText);
      return { ...prev, [id]: { ...cur, [l]: { ...cur[l], [k]: v } } };
    });

  return (
    <section aria-labelledby="about-gallery" className="mb-8">
      <h2 id="about-gallery" className="mb-2 text-xl font-semibold">{`Фотогалерея архива (${photos.length})`}</h2>
      <p className="mb-2 max-w-3xl">Фото здания, залов и мероприятий архива. На сайте фото появляется после проверки антивирусом и только с описанием для незрячих на русском. Сканы документов сюда не загружаются: они ведутся в каталоге.</p>
      <p role="status" className="mb-2">{status}</p>
      <ErrorMessage error={error} />
      {photos.length === 0 ? <p className="mb-3">Фото пока нет.</p> : (
        <ol className="mb-4 flex max-w-4xl flex-col gap-4">
          {photos.map((p, n) => (
            <li key={p.id} className="flex flex-col gap-2 border-b border-border pb-3">
              <div className="flex flex-wrap items-start gap-3">
                <img src={`/api/v1/admin/about/gallery/${p.id}`} alt={`Предпросмотр фото: ${p.filename}`} className="max-h-32 w-fit rounded border border-border" />
                <p className="min-w-0 grow">{`${n + 1}. «${p.filename}»: ${ANTIVIRUS[p.antivirusStatus] ?? p.antivirusStatus}${p.translations.ru?.altText ? '' : ', нет описания — на сайте не показывается'}${p.dataOrigin === 'demo' ? ', демонстрационное' : ''}.`}</p>
              </div>
              {ADMIN_LOCALES.map((l) => (
                <div key={l.code} className="grid gap-2 sm:grid-cols-2">
                  <Field id={`ph-${p.id}-${l.code}-alt`} label={`Описание для незрячих (${l.label})`}>
                    <input id={`ph-${p.id}-${l.code}-alt`} className="input" lang={l.code} readOnly={!canWrite} value={texts[p.id]?.[l.code].altText ?? ''} onChange={(e) => setText(p.id, l.code, 'altText', e.target.value)} />
                  </Field>
                  <Field id={`ph-${p.id}-${l.code}-cap`} label={`Подпись (${l.label})`}>
                    <input id={`ph-${p.id}-${l.code}-cap`} className="input" lang={l.code} readOnly={!canWrite} value={texts[p.id]?.[l.code].caption ?? ''} onChange={(e) => setText(p.id, l.code, 'caption', e.target.value)} />
                  </Field>
                </div>
              ))}
              {canWrite ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => {
                    const cur = texts[p.id];
                    if (cur) void call(() => adminRequest('PUT', `/admin/about/gallery/${p.id}`, { translations: filled(cur, 'altText') }), `Подпись фото «${p.filename}» сохранена.`);
                  }}>{`Сохранить подпись фото ${n + 1}`}</button>
                  <button type="button" className="btn-secondary" disabled={busy || n === 0} aria-label={`Выше: фото ${n + 1}`} onClick={() => void call(() => adminRequest('POST', `/admin/about/gallery/${p.id}/move`, { direction: 'up' }), 'Порядок фото изменён.')}>Выше</button>
                  <button type="button" className="btn-secondary" disabled={busy || n === photos.length - 1} aria-label={`Ниже: фото ${n + 1}`} onClick={() => void call(() => adminRequest('POST', `/admin/about/gallery/${p.id}/move`, { direction: 'down' }), 'Порядок фото изменён.')}>Ниже</button>
                  <button type="button" className="btn-secondary" disabled={busy} aria-label={`Удалить: фото ${n + 1}`} onClick={() => setDeleting(p)}>Удалить</button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {canUpload ? (
        <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <OriginSelect id="ph-origin" value={origin} onChange={setOrigin} />
          <Field id="ph-upload" label="Добавить фото" hint="Можно выбрать несколько файлов JPEG, PNG или WebP.">
            <input id="ph-upload" type="file" multiple accept="image/jpeg,image/png,image/webp" aria-describedby="ph-upload-hint" disabled={busy} onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
          </Field>
        </div>
      ) : canWrite ? <p>Загружать файлы может сотрудник с правом загрузки.</p> : null}
      <ConfirmDialog
        open={deleting !== null}
        title="Удалить фото?"
        description={`Фото «${deleting?.filename ?? ''}» исчезнет из галереи и с сайта.`}
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          const p = deleting;
          setDeleting(null);
          if (p) void call(() => adminRequest('DELETE', `/admin/about/gallery/${p.id}`, { confirm: true }), 'Фото удалено.');
        }}
        onCancel={() => setDeleting(null)}
      />
    </section>
  );
}
