import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { adminRequest, errorText } from './api.ts';
import { useAdminData } from './useAdminData.ts';

interface Item {
  id: string;
  topic: string;
  message: string;
  contactEmail: string | null;
  locale: string;
  pagePath: string | null;
  status: 'new' | 'read' | 'archived';
  createdAt: string;
}

const TOPIC: Record<string, string> = { site: 'Работа сайта', catalog: 'Электронный каталог', accessibility: 'Доступность', content: 'Материалы и тексты', suggestion: 'Предложение', other: 'Другое' };
const STATUS: Record<Item['status'], string> = { new: 'Новый', read: 'Прочитан', archived: 'В архиве' };

/** Отзывы и предложения посетителей (ЭТАП 7). Право feedback:read; смена статуса пишется в журнал. */
export function FeedbackAdminPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const list = useAdminData<{ items: Item[]; total: number }>(`/admin/feedback${status ? `?status=${status}` : ''}`);
  const [message, setMessage] = useState<string | null>(null);

  const change = async (id: string, next: Item['status']) => {
    try {
      await adminRequest('POST', `/admin/feedback/${id}/status`, { status: next });
      setMessage(`Статус изменён: ${STATUS[next]}.`);
      list.reload();
    } catch (error) {
      setMessage(errorText(error));
    }
  };

  return (
    <>
      <AdminHeading title="Отзывы и предложения" />
      <p className="mb-3 max-w-3xl">Отзывы о сайте. Это не обращения граждан: ответ не обязателен. Адрес почты указан только при согласии автора.</p>
      <div className="admin-field max-w-xs">
        <label htmlFor="fb-status">Статус</label>
        <select id="fb-status" className="input" value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
          <option value="">Новые и прочитанные</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <p role="status" className="mb-2">{message}</p>
      <ErrorMessage error={list.error} />
      {list.data ? (
        list.data.items.length === 0 ? (
          <p>Отзывов нет.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {list.data.items.map((f) => (
              <li key={f.id} className="rounded-md border border-border bg-surface p-3">
                <p className="text-sm text-muted">
                  <time dateTime={f.createdAt}>{new Date(f.createdAt).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}</time>
                  {` · ${TOPIC[f.topic] ?? f.topic} · ${f.locale.toUpperCase()} · ${STATUS[f.status]}`}
                  {f.pagePath ? ` · ${f.pagePath}` : ''}
                </p>
                <p className="my-2 whitespace-pre-line">{f.message}</p>
                {f.contactEmail ? <p className="text-sm">Почта: <a href={`mailto:${f.contactEmail}`}>{f.contactEmail}</a></p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {f.status !== 'read' ? <button type="button" className="btn-secondary" onClick={() => void change(f.id, 'read')}>Отметить прочитанным</button> : null}
                  {f.status !== 'archived' ? <button type="button" className="btn-secondary" onClick={() => void change(f.id, 'archived')}>В архив</button> : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </>
  );
}
