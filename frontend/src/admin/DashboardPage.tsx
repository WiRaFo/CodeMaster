import { Link } from 'react-router';
import { AdminHeading, ErrorMessage, useAuth } from './AdminApp.tsx';
import { adminRequest } from './api.ts';
import { STATUS_LABEL } from './labels.ts';
import { useAdminData } from './useAdminData.ts';

interface Short {
  id: string;
  status: string;
  title: string | null;
  updatedAt: string;
}
interface Dashboard {
  counts: Record<string, number>;
  reviewQueue: Short[];
  publishQueue: Short[];
  mine: Short[];
}
interface Notifications {
  unread: number;
  items: Array<{ id: string; entityType: string; entityId: string; message: string; createdAt: string; read: boolean }>;
}

const time = (iso: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(new Date(iso));

/** Обзор (F-153): статусы документов, очереди на проверку и публикацию, мои черновики, уведомления (ТЗ §6.7). */
export function DashboardPage() {
  const { can, refreshNotifications } = useAuth();
  const catalog = ['catalog:edit', 'catalog:submit', 'catalog:review', 'catalog:publish'].some(can);
  const dash = useAdminData<Dashboard>(catalog ? '/admin/dashboard' : null);
  const notes = useAdminData<Notifications>('/admin/notifications');

  const markRead = async (id: string) => {
    await adminRequest('POST', `/admin/notifications/${id}/read`);
    notes.reload();
    refreshNotifications();
  };

  return (
    <>
      <AdminHeading title="Обзор">
        {can('catalog:edit') ? <Link to="/admin/documents/new" className="btn-primary">Создать документ</Link> : null}
      </AdminHeading>
      <ErrorMessage error={dash.error ?? notes.error} />

      <section aria-labelledby="notes-title" className="mb-8">
        <h2 id="notes-title" className="mb-3 text-2xl font-bold">Уведомления</h2>
        {notes.data && notes.data.items.length === 0 ? <p>Новых уведомлений нет.</p> : null}
        <ul className="grid gap-2">
          {notes.data?.items.map((n) => (
            <li key={n.id} className={`flex flex-wrap items-center gap-3 rounded border border-border p-3 ${n.read ? 'opacity-75' : 'font-semibold'}`}>
              <span className="flex-1">
                {n.read ? null : <span className="visually-hidden">Новое: </span>}
                {n.entityType === 'documents' || n.entityType === 'exhibitions' ? <Link to={`/admin/${n.entityType}/${n.entityId}`}>{n.message}</Link> : n.message}
              </span>
              <time className="text-sm text-muted" dateTime={n.createdAt}>{time(n.createdAt)}</time>
              {n.read ? null : (
                <button type="button" className="btn-secondary" onClick={() => void markRead(n.id)}>Прочитано</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {dash.data ? (
        <>
          <section aria-labelledby="counts-title" className="mb-8">
            <h2 id="counts-title" className="mb-3 text-2xl font-bold">Документы по статусам</h2>
            <ul className="flex flex-wrap gap-3">
              {Object.keys(STATUS_LABEL).map((s) => (
                <li key={s}>
                  <Link to={`/admin/documents?status=${s}`} className="block rounded border border-border px-4 py-2">
                    {STATUS_LABEL[s]}: <strong>{dash.data?.counts[s] ?? 0}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <Queue id="review" title="Ждут проверки" items={dash.data.reviewQueue} show={can('catalog:review')} />
          <Queue id="publish" title="Одобрены и ждут публикации" items={dash.data.publishQueue} show={can('catalog:publish')} />
          <Queue id="mine" title="Мои черновики и документы на доработке" items={dash.data.mine} show={can('catalog:edit')} />
        </>
      ) : null}
    </>
  );
}

function Queue({ id, title, items, show }: { id: string; title: string; items: Short[]; show: boolean }) {
  if (!show) return null;
  return (
    <section aria-labelledby={`${id}-title`} className="mb-8">
      <h2 id={`${id}-title`} className="mb-3 text-2xl font-bold">{title}</h2>
      {items.length === 0 ? (
        <p>Пусто.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3">
              <Link to={`/admin/documents/${d.id}`}>{d.title ?? 'Без названия'}</Link>
              <span className="status-badge" data-status={d.status}>{STATUS_LABEL[d.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
