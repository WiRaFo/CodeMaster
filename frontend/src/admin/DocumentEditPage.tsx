import { LOCALES, documentCompletenessIssues, type Locale } from '@archive-vko/shared';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAnnounce } from '../app/Announcer.tsx';
import { AdminHeading, ErrorMessage, useAuth } from './AdminApp.tsx';
import { AdminApiError, adminRequest, adminUpload, errorText } from './api.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { ACCESS_LABEL, ACTION_LABEL, AUDIT_LABEL, STATUS_LABEL, actionPath } from './labels.ts';
import { useAdminData } from './useAdminData.ts';
import { formatDateTime } from './format.ts';

interface TranslationForm {
  title: string;
  description: string;
  historicalNote: string;
  accessConditions: string;
  transcription: string;
}
interface FormState {
  caseId: string;
  documentNumber: string;
  documentTypeCode: string;
  dateFrom: string;
  dateTo: string;
  sheetsFrom: string;
  sheetsTo: string;
  sheetCount: string;
  originalLanguages: string;
  authorText: string;
  storageLocation: string;
  accessLevel: 'open' | 'restricted' | 'closed';
  dataOrigin: 'verified' | 'demo';
  sourceNote: string;
  translations: Record<Locale, TranslationForm>;
}
interface DocumentView {
  id: string;
  status: string;
  archiveCode: string;
  updatedAt: string;
  input: Omit<Partial<Record<keyof FormState, unknown>>, 'translations'> & { translations: Partial<Record<Locale, Partial<Record<keyof TranslationForm, string | null>>>> };
  pages: Array<{ assetId: string; pageNumber: number; mimeType: string; processingStatus: string; antivirusStatus: string; filename: string }>;
  actions: string[];
  canEdit: boolean;
  canDelete: boolean;
  history: Array<{ at: string; action: string; summary: string; user: string | null }>;
}
interface Reference {
  documentTypes: Array<{ code: string; name: string }>;
}
interface Tree {
  fonds: Array<{ id: string; number: string; title: string | null; inventories: Array<{ id: string; number: string; title: string | null; cases: Array<{ id: string; number: string; title: string | null }> }> }>;
}

const emptyTranslation = (): TranslationForm => ({ title: '', description: '', historicalNote: '', accessConditions: '', transcription: '' });
const emptyForm = (): FormState => ({
  caseId: '',
  documentNumber: '',
  documentTypeCode: '',
  dateFrom: '',
  dateTo: '',
  sheetsFrom: '',
  sheetsTo: '',
  sheetCount: '',
  originalLanguages: 'ru',
  authorText: '',
  storageLocation: '',
  accessLevel: 'closed',
  dataOrigin: 'demo',
  sourceNote: '',
  translations: { kk: emptyTranslation(), ru: emptyTranslation(), en: emptyTranslation() },
});

const LOCALE_NAME: Record<Locale, string> = { ru: 'Русский', kk: 'Казахский', en: 'Английский' };
const FIELD_NAME: Record<string, string> = {
  caseId: 'Дело',
  documentTypeCode: 'Вид документа',
  dateFrom: 'Дата (начало)',
  dateTo: 'Дата (конец)',
  sourceNote: 'Источник сведений',
  title: 'Название',
  description: 'Краткое описание',
  accessConditions: 'Условия доступа',
};

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

function fromView(view: DocumentView): FormState {
  const i = view.input;
  const tr = (l: Locale): TranslationForm => {
    const t = i.translations[l] ?? {};
    return { title: t.title ?? '', description: t.description ?? '', historicalNote: t.historicalNote ?? '', accessConditions: t.accessConditions ?? '', transcription: t.transcription ?? '' };
  };
  const access = str(i.accessLevel);
  return {
    caseId: str(i.caseId),
    documentNumber: str(i.documentNumber),
    documentTypeCode: str(i.documentTypeCode),
    dateFrom: str(i.dateFrom),
    dateTo: str(i.dateTo) === str(i.dateFrom) ? '' : str(i.dateTo),
    sheetsFrom: str(i.sheetsFrom),
    sheetsTo: str(i.sheetsTo),
    sheetCount: str(i.sheetCount),
    originalLanguages: Array.isArray(i.originalLanguages) ? i.originalLanguages.join(', ') : '',
    authorText: str(i.authorText),
    storageLocation: str(i.storageLocation),
    accessLevel: access === 'open' || access === 'restricted' ? access : 'closed',
    dataOrigin: str(i.dataOrigin) === 'verified' ? 'verified' : 'demo',
    sourceNote: str(i.sourceNote),
    translations: { kk: tr('kk'), ru: tr('ru'), en: tr('en') },
  };
}

function toPayload(f: FormState, confirmOpenAccess: boolean) {
  const nul = (v: string) => (v.trim() ? v.trim() : null);
  return {
    caseId: f.caseId,
    documentNumber: nul(f.documentNumber),
    documentTypeCode: f.documentTypeCode,
    dateFrom: nul(f.dateFrom),
    dateTo: nul(f.dateTo),
    sheetsFrom: nul(f.sheetsFrom),
    sheetsTo: nul(f.sheetsTo),
    sheetCount: f.sheetCount.trim() ? Number(f.sheetCount) : null,
    originalLanguages: f.originalLanguages.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean),
    authorText: nul(f.authorText),
    storageLocation: nul(f.storageLocation),
    accessLevel: f.accessLevel,
    dataOrigin: f.dataOrigin,
    sourceNote: nul(f.sourceNote),
    translations: Object.fromEntries(
      LOCALES.map((l) => [
        l,
        {
          title: nul(f.translations[l].title),
          description: nul(f.translations[l].description),
          historicalNote: nul(f.translations[l].historicalNote),
          accessConditions: nul(f.translations[l].accessConditions),
          transcription: nul(f.translations[l].transcription),
        },
      ]),
    ),
    ...(confirmOpenAccess ? { confirmOpenAccess: true } : {}),
  };
}

type Issue = { path: Array<string | number>; code: string };
const fieldId = (path: Array<string | number>) => `f-${path.join('-')}`;
const issueText = (path: Array<string | number>) => {
  const key = String(path[path.length - 1]);
  const locale = path[0] === 'translations' ? ` (${LOCALE_NAME[path[1] as Locale] ?? path[1]})` : '';
  return `${FIELD_NAME[key] ?? key}${locale}: обязательное поле`;
};

/**
 * Карточка документа в панели (F-144, F-146, F-150, F-154): форма, статус и действия согласования,
 * история изменений. Обязательные для отправки поля проверяются той же функцией, что и на сервере.
 */
export function DocumentEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const announce = useAnnounce();
  const { can, refreshNotifications } = useAuth();
  const ref = useAdminData<Reference>('/admin/reference');
  const tree = useAdminData<Tree>('/admin/catalog/tree');
  const doc = useAdminData<DocumentView>(isNew ? null : `/admin/documents/${id}`);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: 'open' } | { kind: 'action'; action: string } | { kind: 'delete' }>(null);

  useEffect(() => {
    if (doc.data) setForm(fromView(doc.data));
  }, [doc.data]);

  const cases = useMemo(
    () =>
      (tree.data?.fonds ?? []).flatMap((f) =>
        f.inventories.flatMap((i) => i.cases.map((c) => ({ id: c.id, label: `Ф. ${f.number}. Оп. ${i.number}. Д. ${c.number}${c.title ? ` — ${c.title}` : ''}` }))),
      ),
    [tree.data],
  );

  const editable = isNew ? can('catalog:edit') : (doc.data?.canEdit ?? false);
  const initialAccess = doc.data ? str(doc.data.input.accessLevel) : null;
  const issueFor = (path: Array<string | number>) => issues.find((i) => i.path.join('.') === path.join('.'));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setTr = (l: Locale, key: keyof TranslationForm, value: string) =>
    setForm((f) => ({ ...f, translations: { ...f.translations, [l]: { ...f.translations[l], [key]: value } } }));

  const showIssues = (list: Issue[], message: string) => {
    setIssues(list);
    setError(message);
    window.setTimeout(() => document.getElementById('form-errors')?.focus(), 0);
  };

  const save = async (confirmOpenAccess: boolean) => {
    const local: Issue[] = [];
    if (!form.caseId) local.push({ path: ['caseId'], code: 'required' });
    if (!form.documentTypeCode) local.push({ path: ['documentTypeCode'], code: 'required' });
    if (!LOCALES.some((l) => form.translations[l].title.trim())) local.push({ path: ['translations', 'ru', 'title'], code: 'required' });
    if (local.length) return showIssues(local, 'Заполните обязательные поля.');
    if (form.accessLevel === 'open' && initialAccess !== 'open' && !confirmOpenAccess) {
      setDialog({ kind: 'open' });
      return;
    }
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      if (isNew) {
        const created = await adminRequest<{ id: string }>('POST', '/admin/documents', toPayload(form, confirmOpenAccess));
        announce('Черновик сохранён');
        navigate(`/admin/documents/${created.id}`, { replace: true });
      } else {
        await adminRequest('PATCH', `/admin/documents/${id}`, toPayload(form, confirmOpenAccess), { 'If-Match': doc.data?.updatedAt ?? '' });
        setNotice('Изменения сохранены.');
        announce('Изменения сохранены');
        doc.reload();
      }
    } catch (e) {
      if (e instanceof AdminApiError && e.details.length) showIssues(e.details, errorText(e));
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (action: string, comment: string) => {
    if (action === 'submit') {
      // Та же проверка, что на сервере (F-146): подсказываем поля до запроса.
      const list = documentCompletenessIssues({
        dateFrom: form.dateFrom || null,
        accessLevel: form.accessLevel,
        dataOrigin: form.dataOrigin,
        sourceNote: form.sourceNote || null,
        translations: Object.fromEntries(LOCALES.map((l) => [l, { title: form.translations[l].title || null, description: form.translations[l].description || null, accessConditions: form.translations[l].accessConditions || null }])),
      });
      if (list.length) return showIssues(list, 'Перед отправкой на проверку заполните обязательные поля и сохраните документ.');
    }
    setBusy(true);
    setError(null);
    try {
      const res = await adminRequest<{ status: string }>('POST', `/admin/documents/${id}/${actionPath(action)}`, {
        ...(comment ? { comment } : {}),
        ...(action === 'archive' ? { confirm: true } : {}),
      });
      const text = `Статус: ${STATUS_LABEL[res.status]}`;
      setNotice(text);
      announce(text);
      doc.reload();
      refreshNotifications();
    } catch (e) {
      if (e instanceof AdminApiError && e.details.length) showIssues(e.details, errorText(e));
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  /** Пакетная загрузка (ТЗ §7.7): каждый файл отдельно, результат по каждому объявляется. */
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    for (const file of files) {
      try {
        await adminUpload(`/admin/documents/${id}/pages`, file);
      } catch (e) {
        failed.push(`${file.name}: ${errorText(e)}`);
      }
    }
    const ok = files.length - failed.length;
    const text = `Загружено файлов: ${ok} из ${files.length}.`;
    setNotice(text);
    announce(text);
    if (failed.length) setError(failed.join(' '));
    setBusy(false);
    doc.reload();
  };

  const remove = async () => {
    try {
      await adminRequest('DELETE', `/admin/documents/${id}`, { confirm: true });
      announce('Документ удалён');
      navigate('/admin/documents');
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (doc.error) return <><AdminHeading title="Документ" /><ErrorMessage error={doc.error} /></>;
  if (!isNew && !doc.data) return <p role="status">Загрузка…</p>;

  const title = isNew ? 'Новый документ' : form.translations.ru.title || form.translations.kk.title || form.translations.en.title || 'Документ без названия';
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  return (
    <>
      <p className="mb-2"><Link to="/admin/documents">← Все документы</Link></p>
      <AdminHeading title={title} />

      {doc.data ? (
        <section aria-labelledby="status-title" className="mb-6 rounded border border-border p-4">
          <h2 id="status-title" className="mb-2 text-xl font-bold">Статус и согласование</h2>
          <p className="mb-3">
            <span className="status-badge" data-status={doc.data.status} data-testid="doc-status">{STATUS_LABEL[doc.data.status]}</span>
            <span className="ml-3">{doc.data.archiveCode}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            {doc.data.actions.map((a) => (
              <button
                key={a}
                type="button"
                className={a === 'publish' || a === 'approve' || a === 'submit' ? 'btn-primary' : 'btn-secondary'}
                disabled={busy}
                onClick={() => (a === 'request_changes' || a === 'archive' ? setDialog({ kind: 'action', action: a }) : void runAction(a, ''))}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
            {doc.data.actions.length === 0 ? <p className="text-muted">Для вашей роли в этом статусе действий нет.</p> : null}
            {doc.data.canDelete ? (
              <button type="button" className="btn-secondary" onClick={() => setDialog({ kind: 'delete' })}>Удалить</button>
            ) : null}
          </div>
        </section>
      ) : null}

      {notice ? <p role="status" className="mb-4 font-semibold">{notice}</p> : null}
      {error ? (
        <div id="form-errors" tabIndex={-1} role="alert" className="mb-4 rounded border-2 border-danger p-3">
          <p className="font-semibold text-danger">{error}</p>
          {issues.length ? (
            <ul className="mt-2 list-disc pl-6">
              {issues.map((i) => (
                <li key={i.path.join('.')}>
                  <a href={`#${fieldId(i.path)}`} onClick={(e) => { e.preventDefault(); openDetails(i.path); document.getElementById(fieldId(i.path))?.focus(); }}>{issueText(i.path)}</a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!editable || busy} className="grid gap-x-6 lg:grid-cols-2">
          <legend className="visually-hidden">Сведения о документе</legend>
          {!editable ? <p className="mb-4 lg:col-span-2">Редактирование в этом статусе недоступно для вашей роли.</p> : null}

          <Field id="f-caseId" label="Дело (фонд, опись, дело)" required issue={issueFor(['caseId'])}>
            <select id="f-caseId" className="input" value={form.caseId} onChange={(e) => set('caseId', e.target.value)} aria-invalid={Boolean(issueFor(['caseId']))} aria-describedby="f-caseId-err">
              <option value="">— выберите дело —</option>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field id="f-documentTypeCode" label="Вид документа" required issue={issueFor(['documentTypeCode'])}>
            <select id="f-documentTypeCode" className="input" value={form.documentTypeCode} onChange={(e) => set('documentTypeCode', e.target.value)} aria-invalid={Boolean(issueFor(['documentTypeCode']))} aria-describedby="f-documentTypeCode-err">
              <option value="">— выберите вид —</option>
              {ref.data?.documentTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </Field>
          <Field id="f-documentNumber" label="Номер документа в деле">
            <input id="f-documentNumber" className="input" value={form.documentNumber} onChange={(e) => set('documentNumber', e.target.value)} />
          </Field>
          <Field id="f-dateFrom" label="Дата" hint="Год, год и месяц или полная дата: 1956, 1956-03, 1956-03-14" requiredForReview issue={issueFor(['dateFrom'])}>
            <input id="f-dateFrom" className="input" inputMode="numeric" value={form.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} aria-invalid={Boolean(issueFor(['dateFrom']))} aria-describedby="f-dateFrom-hint f-dateFrom-err" />
          </Field>
          <Field id="f-dateTo" label="Дата окончания (если период)" hint="Оставьте пустым для одной даты">
            <input id="f-dateTo" className="input" inputMode="numeric" value={form.dateTo} onChange={(e) => set('dateTo', e.target.value)} aria-describedby="f-dateTo-hint" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field id="f-sheetsFrom" label="Лист с">
              <input id="f-sheetsFrom" className="input" value={form.sheetsFrom} onChange={(e) => set('sheetsFrom', e.target.value)} />
            </Field>
            <Field id="f-sheetsTo" label="по">
              <input id="f-sheetsTo" className="input" value={form.sheetsTo} onChange={(e) => set('sheetsTo', e.target.value)} />
            </Field>
            <Field id="f-sheetCount" label="Листов">
              <input id="f-sheetCount" className="input" inputMode="numeric" value={form.sheetCount} onChange={(e) => set('sheetCount', e.target.value)} />
            </Field>
          </div>
          <Field id="f-originalLanguages" label="Языки оригинала" hint="Коды через запятую: ru, kk, de">
            <input id="f-originalLanguages" className="input" value={form.originalLanguages} onChange={(e) => set('originalLanguages', e.target.value)} aria-describedby="f-originalLanguages-hint" />
          </Field>
          <Field id="f-authorText" label="Автор">
            <input id="f-authorText" className="input" value={form.authorText} onChange={(e) => set('authorText', e.target.value)} />
          </Field>
          <Field id="f-storageLocation" label="Место хранения (шифр хранения)">
            <input id="f-storageLocation" className="input" value={form.storageLocation} onChange={(e) => set('storageLocation', e.target.value)} />
          </Field>

          <fieldset className="admin-field">
            <legend className="font-semibold">Уровень доступа</legend>
            {(['closed', 'restricted', 'open'] as const).map((a) => (
              <label key={a} className="choice">
                <input type="radio" name="accessLevel" value={a} checked={form.accessLevel === a} onChange={() => set('accessLevel', a)} />
                <span>{ACCESS_LABEL[a]}{a === 'closed' ? ' — не публикуется' : a === 'restricted' ? ' — только карточка и условия доступа' : ' — карточка, копия и расшифровка'}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="admin-field">
            <legend className="font-semibold">Происхождение сведений</legend>
            <label className="choice">
              <input type="radio" name="dataOrigin" value="verified" checked={form.dataOrigin === 'verified'} onChange={() => set('dataOrigin', 'verified')} />
              <span>Проверенные сведения архива (нужен источник)</span>
            </label>
            <label className="choice">
              <input type="radio" name="dataOrigin" value="demo" checked={form.dataOrigin === 'demo'} onChange={() => set('dataOrigin', 'demo')} />
              <span>Демонстрационная запись (на сайте помечается «Демо»)</span>
            </label>
          </fieldset>
          <Field id="f-sourceNote" label="Источник сведений" requiredForReview={form.dataOrigin === 'verified'} issue={issueFor(['sourceNote'])}>
            <input id="f-sourceNote" className="input" value={form.sourceNote} onChange={(e) => set('sourceNote', e.target.value)} aria-invalid={Boolean(issueFor(['sourceNote']))} aria-describedby="f-sourceNote-err" />
          </Field>

          {(['ru', 'kk', 'en'] as const).map((l) => (
              <details key={l} id={`details-${l}`} open={l === 'ru'} className="mb-4 rounded border border-border p-3 lg:col-span-2">
                <summary className="cursor-pointer text-lg font-semibold">Текст карточки: {LOCALE_NAME[l]}</summary>
                <div className="mt-3 grid gap-x-6 lg:grid-cols-2" lang={l}>
                  <Field id={`f-translations-${l}-title`} label="Название" required={l === 'ru'} issue={issueFor(['translations', l, 'title'])}>
                    <input id={`f-translations-${l}-title`} className="input" value={form.translations[l].title} onChange={(e) => setTr(l, 'title', e.target.value)} aria-invalid={Boolean(issueFor(['translations', l, 'title']))} aria-describedby={`f-translations-${l}-title-err`} />
                  </Field>
                  <Field id={`f-translations-${l}-accessConditions`} label="Условия доступа" hint="Обязательно для ограниченного доступа" issue={issueFor(['translations', l, 'accessConditions'])}>
                    <input id={`f-translations-${l}-accessConditions`} className="input" value={form.translations[l].accessConditions} onChange={(e) => setTr(l, 'accessConditions', e.target.value)} aria-invalid={Boolean(issueFor(['translations', l, 'accessConditions']))} aria-describedby={`f-translations-${l}-accessConditions-hint f-translations-${l}-accessConditions-err`} />
                  </Field>
                  <Field id={`f-translations-${l}-description`} label="Краткое описание" requiredForReview issue={issueFor(['translations', l, 'description'])}>
                    <textarea id={`f-translations-${l}-description`} className="input min-h-24" value={form.translations[l].description} onChange={(e) => setTr(l, 'description', e.target.value)} aria-invalid={Boolean(issueFor(['translations', l, 'description']))} aria-describedby={`f-translations-${l}-description-err`} />
                  </Field>
                  <Field id={`f-translations-${l}-historicalNote`} label="Историческая справка">
                    <textarea id={`f-translations-${l}-historicalNote`} className="input min-h-24" value={form.translations[l].historicalNote} onChange={(e) => setTr(l, 'historicalNote', e.target.value)} />
                  </Field>
                  <Field id={`f-translations-${l}-transcription`} label="Расшифровка текста" hint="Публикуется только при открытом доступе">
                    <textarea id={`f-translations-${l}-transcription`} className="input min-h-32" value={form.translations[l].transcription} onChange={(e) => setTr(l, 'transcription', e.target.value)} aria-describedby={`f-translations-${l}-transcription-hint`} />
                  </Field>
                </div>
              </details>
            ))}
        </fieldset>
        {editable ? (
          <button type="submit" className="btn-primary" disabled={busy}>{isNew ? 'Сохранить черновик' : 'Сохранить изменения'}</button>
        ) : null}
      </form>

      {doc.data ? (
        <>
          <section aria-labelledby="pages-title" className="mt-8">
            <h2 id="pages-title" className="mb-2 text-xl font-bold">Страницы цифровой копии</h2>
            <p className="mb-3 max-w-3xl text-sm">Файл сохраняется как мастер-копия и показывается на сайте только после проверки антивирусом (подключается на этапе безопасности) и только у документа с открытым доступом.</p>
            {doc.data.canEdit && can('assets:upload') ? (
              <div className="admin-field max-w-md">
                <label htmlFor="page-upload">Добавить страницы (JPEG, PNG, WebP, до 20 МБ)</label>
                <input
                  id="page-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="input"
                  disabled={busy}
                  onChange={(e) => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = '';
                    void uploadFiles(files);
                  }}
                />
              </div>
            ) : null}
            {doc.data.pages.length === 0 ? <p>Сканы не загружены.</p> : (
              <ol className="list-decimal pl-6">
                {doc.data.pages.map((p) => (
                  <li key={p.assetId}>{p.filename} · {p.mimeType} · {p.antivirusStatus === 'clean' ? 'проверен' : 'ожидает проверки антивирусом (на сайте не показывается)'}</li>
                ))}
              </ol>
            )}
          </section>
          <section aria-labelledby="history-title" className="mt-8">
            <h2 id="history-title" className="mb-2 text-xl font-bold">История</h2>
            <ol className="grid gap-2">
              {doc.data.history.map((h, i) => (
                <li key={i} className="border-b border-border pb-2">
                  <time dateTime={h.at} className="text-sm text-muted">{formatDateTime(h.at)}</time>
                  {' · '}
                  <strong>{AUDIT_LABEL[h.action] ?? h.action}</strong>
                  {h.user ? ` · ${h.user}` : ''}
                  <div>{h.summary}</div>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === 'open'}
        title="Открыть доступ к документу?"
        description={<p>После публикации карточка, цифровая копия и расшифровка станут доступны всем посетителям сайта. Убедитесь, что документ не содержит персональных данных и сведений ограниченного доступа.</p>}
        confirmLabel="Да, открыть доступ"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void save(true);
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'action' && dialog.action === 'request_changes'}
        title="Вернуть на доработку"
        description={<p>Автор получит уведомление с вашим комментарием.</p>}
        withComment="Что нужно исправить"
        confirmLabel="Вернуть на доработку"
        onCancel={() => setDialog(null)}
        onConfirm={(comment) => {
          setDialog(null);
          void runAction('request_changes', comment);
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'action' && dialog.action === 'archive'}
        title="Снять документ с публикации?"
        description={<p>Документ исчезнет с сайта и из поиска. Вернуть его можно кнопкой «Опубликовать снова».</p>}
        confirmLabel="Снять с публикации"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void runAction('archive', '');
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="Удалить документ?"
        description={<p>Документ будет скрыт отовсюду. Действие записывается в журнал.</p>}
        confirmLabel="Удалить"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void remove();
        }}
      />
    </>
  );
}

/** Раскрыть блок перевода, в котором ошибка, чтобы поле можно было сфокусировать. */
function openDetails(path: Array<string | number>) {
  if (path[0] !== 'translations') return;
  const details = document.getElementById(`details-${String(path[1])}`);
  if (details instanceof HTMLDetailsElement) details.open = true;
}

function Field({
  id,
  label,
  hint,
  required,
  requiredForReview,
  issue,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  requiredForReview?: boolean;
  issue?: Issue | undefined;
  children: ReactNode;
}) {
  return (
    <div className="admin-field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="visually-hidden"> (обязательно)</span> : null}
        {requiredForReview && !required ? <span className="text-sm font-normal text-muted"> (обязательно для отправки на проверку)</span> : null}
      </label>
      {hint ? <span id={`${id}-hint`} className="hint">{hint}</span> : null}
      {children}
      <span id={`${id}-err`} className="field-error">{issue ? 'Заполните это поле' : ''}</span>
    </div>
  );
}
