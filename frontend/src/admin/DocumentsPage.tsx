import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AdminHeading, ErrorMessage, useAuth } from './AdminApp.tsx';
import { ACCESS_LABEL, STATUS_LABEL } from './labels.ts';
import { useAdminData } from './useAdminData.ts';

interface Row {
  id: string;
  title: string | null;
  archiveCode: string;
  documentNumber: string | null;
  status: string;
  access: string;
  dataOrigin: string;
  updatedAt: string;
}
interface Page {
  items: Row[];
  total: number;
  page: number;
  totalPages: number;
}

/** Список документов каталога со статусами согласования (F-144). Фильтры — в адресе. */
export function DocumentsPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const query = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(page) });
  const list = useAdminData<Page>(`/admin/documents?${query.toString()}`);
  const [draftQ, setDraftQ] = useState(q);

  const search = (e: FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (draftQ.trim()) next.set('q', draftQ.trim());
    else next.delete('q');
    next.delete('page');
    setParams(next);
  };

  return (
    <>
      <AdminHeading title="Документы">
        {can('catalog:edit') ? <Link to="/admin/documents/new" className="btn-primary">Создать документ</Link> : null}
      </AdminHeading>
      <form onSubmit={search} className="mb-4 flex flex-wrap items-end gap-3" role="search" aria-label="Поиск документов">
        <div className="admin-field mb-0">
          <label htmlFor="doc-q">Название</label>
          <input id="doc-q" className="input" value={draftQ} onChange={(e) => setDraftQ(e.target.value)} />
        </div>
        <div className="admin-field mb-0">
          <label htmlFor="doc-status">Статус</label>
          <select
            id="doc-status"
            className="input"
            value={status}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set('status', e.target.value);
              else next.delete('status');
              next.delete('page');
              setParams(next);
            }}
          >
            <option value="">Все</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Найти</button>
      </form>
      <ErrorMessage error={list.error} />
      {list.data ? (
        <>
          <p role="status" className="mb-2">Найдено: {list.data.total}</p>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Документ</th>
                  <th scope="col">Шифр</th>
                  <th scope="col">Статус</th>
                  <th scope="col">Доступ</th>
                  <th scope="col">Изменён</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/admin/documents/${d.id}`}>{d.title ?? 'Без названия'}</Link>
                      {d.dataOrigin === 'demo' || d.dataOrigin === 'synthetic' ? <span className="ml-2 text-sm text-muted">({d.dataOrigin === 'demo' ? 'демо' : 'тестовые'})</span> : null}
                    </td>
                    <td>{d.archiveCode}{d.documentNumber ? `, № ${d.documentNumber}` : ''}</td>
                    <td><span className="status-badge" data-status={d.status}>{STATUS_LABEL[d.status]}</span></td>
                    <td>{ACCESS_LABEL[d.access]}</td>
                    <td>{new Date(d.updatedAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data.totalPages > 1 ? (
            <nav aria-label="Страницы списка" className="mt-4 flex items-center gap-3">
              {page > 1 ? <Link className="btn-secondary" to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page - 1) }).toString()}`}>Назад</Link> : null}
              <span>Страница {page} из {list.data.totalPages}</span>
              {page < list.data.totalPages ? <Link className="btn-secondary" to={`?${new URLSearchParams({ ...Object.fromEntries(params), page: String(page + 1) }).toString()}`}>Вперёд</Link> : null}
            </nav>
          ) : null}
        </>
      ) : null}
    </>
  );
}
