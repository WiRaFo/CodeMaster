import { useSearchParams } from 'react-router';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { AUDIT_LABEL } from './labels.ts';
import { useAdminData } from './useAdminData.ts';
import { formatDateTime } from './format.ts';

interface Page {
  items: Array<{ id: string; at: string; user: string | null; action: string; entityType: string | null; summary: string; ip: string | null }>;
  total: number;
}

/** Журнал действий (ТЗ §6.8; F-152). Только чтение: записи журнала не правятся и не удаляются. */
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get('action') ?? '';
  const log = useAdminData<Page>(`/admin/audit-logs${action ? `?action=${encodeURIComponent(action)}` : ''}`);
  return (
    <>
      <AdminHeading title="Журнал действий" />
      <div className="admin-field max-w-xs">
        <label htmlFor="audit-action">Действие</label>
        <select id="audit-action" className="input" value={action} onChange={(e) => setParams(e.target.value ? { action: e.target.value } : {})}>
          <option value="">Все</option>
          {Object.entries(AUDIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <ErrorMessage error={log.error} />
      {log.data ? (
        <>
          <p role="status" className="mb-2">Записей: {log.data.total}. Показаны последние 50.</p>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Время</th>
                  <th scope="col">Сотрудник</th>
                  <th scope="col">Действие</th>
                  <th scope="col">Описание</th>
                  <th scope="col">IP</th>
                </tr>
              </thead>
              <tbody>
                {log.data.items.map((r) => (
                  <tr key={r.id}>
                    <td><time dateTime={r.at}>{formatDateTime(r.at)}</time></td>
                    <td>{r.user ?? '—'}</td>
                    <td>{AUDIT_LABEL[r.action] ?? r.action}</td>
                    <td>{r.summary}</td>
                    <td>{r.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
