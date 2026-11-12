import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { adminRequest, errorText } from './api.ts';
import { readTableFile, type TableData } from './table-file.ts';
import { useAdminData } from './useAdminData.ts';

interface Field { key: string; label: string; required: boolean }
interface RowResult {
  line: number;
  code: string | null;
  title: string | null;
  status: 'ok' | 'error' | 'duplicate';
  issues: Array<{ field: string; code: string; message: string }>;
  creates: Array<'fond' | 'inventory' | 'case'>;
  accessLevel: string | null;
}
interface Summary { total: number; ok: number; errors: number; duplicates: number; created?: number }
interface Preview { fields: Field[]; mapping: Record<string, number>; missingFields: string[]; summary: Summary; rows: RowResult[] }
interface CommitResult { jobId: string; summary: Summary & { created: number }; rows: RowResult[]; created: Array<{ line: number; id: string }> }

const STATUS: Record<RowResult['status'], string> = { ok: 'Готова', error: 'Ошибка', duplicate: 'Дубликат' };
const CREATES: Record<string, string> = { fond: 'фонд', inventory: 'опись', case: 'дело' };
const ACCESS: Record<string, string> = { open: 'открытый', restricted: 'ограниченный', closed: 'закрытый' };
const SHOWN = 200;

function protocolCsv(rows: RowResult[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.filter((r) => r.status !== 'ok').map((r) => [String(r.line), STATUS[r.status], r.code ?? '', r.title ?? '', r.issues.map((i) => i.message).join('; ')].map(esc).join(';'));
  return `﻿${['Строка;Результат;Шифр;Заголовок;Причина', ...lines].join('\r\n')}\r\n`;
}

/**
 * Импорт описи (F-145; дополнение к ТЗ §3.5): файл → сопоставление столбцов → предпросмотр → загрузка черновиками.
 * Право catalog:import; права и данные проверяет сервер, страница только показывает его ответ.
 */
export function ImportPage() {
  const ref = useAdminData<{ branches: Array<{ id: string; slug: string; name: string }> }>('/admin/reference');
  const [branchSlug, setBranchSlug] = useState('main');
  const [dataOrigin, setDataOrigin] = useState<'demo' | 'verified'>('demo');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<TableData | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (step: 'preview' | 'commit', data: TableData, map: Record<string, number> | undefined) =>
    adminRequest<Preview | CommitResult>('POST', `/admin/import/documents/${step}`, { branchSlug, dataOrigin, fileName, header: data.header, rows: data.rows, ...(map ? { mapping: map } : {}) });

  const runPreview = async (data: TableData, map?: Record<string, number>) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const p = (await request('preview', data, map)) as Preview;
      setPreview(p);
      setMapping(p.mapping);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setResult(null);
    setTable(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const data = await readTableFile(file);
      if (data.rows.length > 2000) throw new Error('В одном файле не больше 2000 строк. Разделите опись на части.');
      setTable(data);
      await runPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : errorText(e));
    }
  };

  const commit = async () => {
    if (!table) return;
    setBusy(true);
    setError(null);
    try {
      setResult((await request('commit', table, mapping)) as CommitResult);
      setPreview(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const download = (rows: RowResult[]) => {
    const url = URL.createObjectURL(new Blob([protocolCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `protokol-importa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = result?.rows ?? preview?.rows ?? [];
  const summary = result?.summary ?? preview?.summary;

  return (
    <>
      <AdminHeading title="Импорт описи" />
      <div className="mb-6 max-w-3xl">
        <p>Загрузите опись в формате CSV или XLSX: одна строка — один документ. Недостающие фонды, описи и дела будут созданы.</p>
        <p className="mt-2">Всё создаётся черновиками и не появляется на сайте до согласования. Если уровень доступа не указан, документ будет закрытым. Повторы уже имеющихся документов пропускаются.</p>
        <p className="mt-2"><a href="/files/templates/import-opis.csv" download>Скачать шаблон CSV</a></p>
      </div>

      <div className="mb-4 grid max-w-3xl gap-4 sm:grid-cols-2">
        <div className="admin-field">
          <label htmlFor="imp-branch">Подразделение</label>
          <select id="imp-branch" className="input" value={branchSlug} onChange={(e) => { setBranchSlug(e.target.value); setPreview(null); }}>
            {(ref.data?.branches ?? []).map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}
          </select>
        </div>
        <div className="admin-field">
          <label htmlFor="imp-origin">Происхождение сведений</label>
          <select id="imp-origin" className="input" value={dataOrigin} onChange={(e) => setDataOrigin(e.target.value === 'verified' ? 'verified' : 'demo')}>
            <option value="demo">Демонстрационные (метка «Демо»)</option>
            <option value="verified">Сведения архива</option>
          </select>
        </div>
        <div className="admin-field sm:col-span-2">
          <label htmlFor="imp-file">Файл описи</label>
          <p id="imp-file-hint" className="hint">CSV в UTF-8 (разделитель «;» или «,») или XLSX, первый лист. До 2000 строк.</p>
          <input id="imp-file" type="file" accept=".csv,.tsv,.txt,.xlsx" aria-describedby="imp-file-hint" onChange={(e) => void onFile(e)} />
        </div>
      </div>
      <ErrorMessage error={error} />
      <p role="status" className="mb-2">{busy ? 'Проверяем строки…' : result ? `Загружено черновиков: ${result.summary.created}.` : ''}</p>

      {preview && table ? (
        <section aria-labelledby="imp-map" className="mb-6">
          <h2 id="imp-map" className="mb-2 text-xl font-semibold">Сопоставление столбцов</h2>
          <p className="mb-3 max-w-3xl">Столбцы подобраны по названиям. Проверьте и при необходимости поменяйте, затем обновите предпросмотр.</p>
          <div className="grid max-w-4xl gap-3 sm:grid-cols-2">
            {preview.fields.map((f) => (
              <div key={f.key} className="admin-field">
                <label htmlFor={`map-${f.key}`}>{f.label}{f.required ? ' (обязательно)' : ''}</label>
                <select id={`map-${f.key}`} className="input" value={mapping[f.key] ?? ''} aria-invalid={preview.missingFields.includes(f.key) || undefined}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value === '') delete next[f.key];
                    else next[f.key] = Number(e.target.value);
                    setMapping(next);
                  }}>
                  <option value="">Нет в файле</option>
                  {table.header.map((h, i) => <option key={i} value={i}>{h || `Столбец ${i + 1}`}</option>)}
                </select>
              </div>
            ))}
          </div>
          {preview.missingFields.length ? (
            <p role="alert" className="mt-3 font-semibold text-danger">Не сопоставлены обязательные поля: {preview.fields.filter((f) => preview.missingFields.includes(f.key)).map((f) => f.label.toLowerCase()).join(', ')}.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void runPreview(table, mapping)}>Обновить предпросмотр</button>
            <button type="button" className="btn-primary" disabled={busy || preview.missingFields.length > 0 || preview.summary.ok === 0} onClick={() => void commit()}>
              Загрузить строк: {preview.summary.ok}
            </button>
          </div>
        </section>
      ) : null}

      {summary ? (
        <section aria-labelledby="imp-rows">
          <h2 id="imp-rows" className="mb-2 text-xl font-semibold">{result ? 'Протокол загрузки' : 'Предпросмотр'}</h2>
          <p className="mb-3" data-testid="import-summary">
            Строк: {summary.total}. Готовы к загрузке: {summary.ok}. С ошибками: {summary.errors}. Дубликатов: {summary.duplicates}.
            {result ? ` Создано черновиков: ${result.summary.created}.` : ''}
          </p>
          <div className="mb-3 flex flex-wrap gap-3">
            {summary.errors + summary.duplicates > 0 ? <button type="button" className="btn-secondary" onClick={() => download(rows)}>Скачать протокол ошибок (CSV)</button> : null}
            {result ? <Link to="/admin/documents?status=draft">Открыть черновики</Link> : null}
          </div>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead><tr><th scope="col">Строка</th><th scope="col">Результат</th><th scope="col">Шифр</th><th scope="col">Заголовок</th><th scope="col">Доступ</th><th scope="col">Пояснение</th></tr></thead>
              <tbody>
                {rows.slice(0, SHOWN).map((r) => {
                  const created = result?.created.find((c) => c.line === r.line);
                  return (
                    <tr key={r.line}>
                      <td>{r.line}</td>
                      <td>{STATUS[r.status]}</td>
                      <td>{r.code ?? ''}</td>
                      <td>{created ? <Link to={`/admin/documents/${created.id}`}>{r.title}</Link> : r.title}</td>
                      <td>{r.accessLevel ? ACCESS[r.accessLevel] : ''}</td>
                      <td>
                        {r.issues.length ? <ul className="list-disc pl-5">{r.issues.map((i, k) => <li key={k}>{i.message}</li>)}</ul> : null}
                        {r.status === 'ok' && r.creates.length && !result ? `Будет создано: ${r.creates.map((c) => CREATES[c]).join(', ')}` : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > SHOWN ? <p className="mt-2 text-muted">Показаны первые {SHOWN} строк. Полный список ошибок — в протоколе.</p> : null}
        </section>
      ) : null}
    </>
  );
}
