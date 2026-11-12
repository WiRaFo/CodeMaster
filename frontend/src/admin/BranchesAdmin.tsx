import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { AdminApiError, adminRequest, errorText } from './api.ts';
import { useAdminData } from './useAdminData.ts';

interface BranchRow { id: string; slug: string; name: string; phone: string | null; hasCoordinates: boolean; verifiedAt: string | null }

type Locale = 'ru' | 'kk' | 'en';
const LOCALES: ReadonlyArray<{ code: Locale; label: string }> = [
  { code: 'ru', label: 'Русский' },
  { code: 'kk', label: 'Казахский' },
  { code: 'en', label: 'Английский' },
];
const TEXT_FIELDS = [
  { key: 'fullName', label: 'Полное название', required: true },
  { key: 'shortName', label: 'Краткое название', required: false },
  { key: 'address', label: 'Адрес', required: false },
  { key: 'scheduleText', label: 'Режим работы', required: false },
  { key: 'readingRoomSchedule', label: 'Часы читального зала', required: false },
] as const;
type TextKey = (typeof TEXT_FIELDS)[number]['key'];
type Texts = Record<TextKey, string>;

interface BranchDetail {
  id: string;
  slug: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  showOnMap: boolean;
  verifiedAt: string | null;
  updatedAt: string;
  translations: Partial<Record<Locale, Record<TextKey, string | null> & { translationStatus: string }>>;
}

const FIELD_LABEL: Record<string, string> = {
  phone: 'Телефон', email: 'Электронная почта', website: 'Сайт', postalCode: 'Почтовый индекс', lat: 'Широта', lng: 'Долгота', showOnMap: 'Показывать на карте',
  fullName: 'Полное название', shortName: 'Краткое название', address: 'Адрес', scheduleText: 'Режим работы', readingRoomSchedule: 'Часы читального зала',
};

/**
 * Филиалы (F-147). Список показывает только филиалы, которые сотрудник может менять: администратор филиала видит свой.
 * Права проверяет сервер; чужой филиал отвечает «не найдено».
 */
export function BranchesAdminPage() {
  const list = useAdminData<{ items: BranchRow[] }>('/admin/branches');
  return (
    <>
      <AdminHeading title="Филиалы" />
      <p className="mb-4 max-w-3xl">Контакты, адреса, часы работы и координаты. Изменения сразу видны на сайте и записываются в журнал действий.</p>
      <ErrorMessage error={list.error} />
      {list.data ? (
        <table className="admin-table">
          <thead><tr><th scope="col">Подразделение</th><th scope="col">Телефон</th><th scope="col">На карте</th><th scope="col">Сверено</th></tr></thead>
          <tbody>
            {list.data.items.map((b) => (
              <tr key={b.id}>
                <td><Link to={`/admin/branches/${b.id}`}>{b.name}</Link></td>
                <td>{b.phone ?? 'нет'}</td>
                <td>{b.hasCoordinates ? 'есть координаты' : 'нет координат'}</td>
                <td>{b.verifiedAt ?? 'требует сверки'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

const emptyTexts = (): Texts => ({ fullName: '', shortName: '', address: '', scheduleText: '', readingRoomSchedule: '' });

export function BranchEditPage() {
  const { id = '' } = useParams();
  const loaded = useAdminData<BranchDetail>(`/admin/branches/${id}`);
  const [form, setForm] = useState<{ phone: string; email: string; website: string; postalCode: string; lat: string; lng: string; showOnMap: boolean; texts: Record<Locale, Texts> } | null>(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const b = loaded.data;
    if (!b) return;
    const texts = (l: Locale): Texts => {
      const t = b.translations[l];
      return t ? { fullName: t.fullName ?? '', shortName: t.shortName ?? '', address: t.address ?? '', scheduleText: t.scheduleText ?? '', readingRoomSchedule: t.readingRoomSchedule ?? '' } : emptyTexts();
    };
    setForm({
      phone: b.phone ?? '', email: b.email ?? '', website: b.website ?? '', postalCode: b.postalCode ?? '',
      lat: b.lat === null ? '' : String(b.lat), lng: b.lng === null ? '' : String(b.lng), showOnMap: b.showOnMap,
      texts: { ru: texts('ru'), kk: texts('kk'), en: texts('en') },
    });
    setUpdatedAt(b.updatedAt);
  }, [loaded.data]);

  if (loaded.error) return <><AdminHeading title="Филиал" /><ErrorMessage error={loaded.error} /><p><Link to="/admin/branches">К списку филиалов</Link></p></>;
  if (!form || !loaded.data) return <p>Загрузка…</p>;

  const name = form.texts.ru.shortName || form.texts.ru.fullName || loaded.data.slug;
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const setText = (l: Locale, k: TextKey, v: string) => setForm({ ...form, texts: { ...form.texts, [l]: { ...form.texts[l], [k]: v } } });
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setStatus(null);
    setInvalid(new Set());
    // Язык без названия не отправляется: неполный перевод не затирает имеющийся.
    const translations = Object.fromEntries(LOCALES.filter((l) => form.texts[l.code].fullName.trim()).map((l) => [l.code, form.texts[l.code]]));
    try {
      const res = await adminRequest<{ updatedAt: string; changed: string[] }>('PATCH', `/admin/branches/${id}`, {
        phone: form.phone, email: form.email, website: form.website, postalCode: form.postalCode,
        lat: num(form.lat), lng: num(form.lng), showOnMap: form.showOnMap, translations,
      }, { 'If-Match': updatedAt });
      setUpdatedAt(res.updatedAt);
      setStatus(res.changed.length ? `Сохранено. Изменено: ${res.changed.map((c) => { const [a, b] = c.split('.'); return b ? `${FIELD_LABEL[b] ?? b} (${a})` : FIELD_LABEL[c] ?? c; }).join(', ')}.` : 'Сохранено, изменений нет.');
    } catch (e) {
      if (e instanceof AdminApiError && e.details.length) {
        setInvalid(new Set(e.details.map((d) => d.path.join('.'))));
        setError(`Проверьте поля: ${[...new Set(e.details.map((d) => { const last = String(d.path[d.path.length - 1]); return FIELD_LABEL[last] ?? last; }))].join(', ')}.`);
      } else setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const input = (key: 'phone' | 'email' | 'website' | 'postalCode' | 'lat' | 'lng', hint?: string, type = 'text') => (
    <div className="admin-field">
      <label htmlFor={`br-${key}`}>{FIELD_LABEL[key]}</label>
      {hint ? <p id={`br-${key}-hint`} className="hint">{hint}</p> : null}
      <input id={`br-${key}`} className="input" type={type} inputMode={key === 'lat' || key === 'lng' ? 'decimal' : undefined} value={form[key]}
        aria-invalid={invalid.has(key) || undefined} aria-describedby={hint ? `br-${key}-hint` : undefined}
        onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  );

  return (
    <>
      <AdminHeading title={`Филиал: ${name}`} />
      <p className="mb-4"><Link to="/admin/branches">К списку филиалов</Link> · <a href={`/ru/branches/${loaded.data.slug}`}>Открыть на сайте</a></p>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex max-w-3xl flex-col gap-4">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xl font-semibold">Контакты</legend>
          {input('phone')}
          {input('email', undefined, 'email')}
          {input('website', 'Только https://. Пусто, если у филиала нет своего сайта.', 'url')}
          {input('postalCode', 'Шесть цифр.')}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xl font-semibold">Координаты</legend>
          <p className="hint">Вносите только проверенные координаты здания. Пока их нет, на сайте работает маршрут по адресу.</p>
          {input('lat', 'Например, 49.948')}
          {input('lng', 'Например, 82.628')}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.showOnMap} onChange={(e) => set({ showOnMap: e.target.checked })} />
            Показывать на карте
          </label>
        </fieldset>
        {LOCALES.map((l) => (
          <fieldset key={l.code} className="flex flex-col gap-3">
            <legend className="mb-2 text-xl font-semibold">{l.label}</legend>
            {l.code !== 'ru' ? <p className="hint">Правка на этом языке снимает пометку «машинный перевод».</p> : null}
            {TEXT_FIELDS.map((f) => {
              const fid = `br-${l.code}-${f.key}`;
              return (
                <div key={f.key} className="admin-field">
                  <label htmlFor={fid}>{f.label}{f.required && l.code === 'ru' ? ' (обязательно)' : ''}</label>
                  <input id={fid} className="input" lang={l.code} value={form.texts[l.code][f.key]}
                    aria-invalid={invalid.has(`translations.${l.code}.${f.key}`) || undefined}
                    onChange={(e) => setText(l.code, f.key, e.target.value)} />
                </div>
              );
            })}
          </fieldset>
        ))}
        <ErrorMessage error={error} />
        <p role="status">{status}</p>
        <div><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить'}</button></div>
      </form>
    </>
  );
}
