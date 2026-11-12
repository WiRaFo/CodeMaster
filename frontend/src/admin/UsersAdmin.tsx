import { useState, type FormEvent } from 'react';
import { AdminHeading, ErrorMessage } from './AdminApp.tsx';
import { AdminApiError, adminRequest, errorText } from './api.ts';
import { useAdminData } from './useAdminData.ts';

interface RoleRef { code: string; branchSlug: string | null }
interface UserRow {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
  roles: Array<RoleRef & { name: string; branchName: string | null }>;
}
interface UsersData {
  items: UserRow[];
  roles: Array<{ code: string; name: string; grantable: boolean; branchScoped: boolean }>;
  branches: Array<{ slug: string; name: string }>;
  me: string;
}
interface Form { id: string | null; updatedAt: string | null; email: string; fullName: string; password: string; isActive: boolean; roles: RoleRef[] }

const ERRORS: Record<string, string> = {
  SELF_CHANGE: 'Свои роли и блокировку себя изменить нельзя: попросите другого администратора.',
  CONFLICT: 'Сотрудник с такой почтой уже есть, или запись изменена другим администратором.',
  FORBIDDEN: 'Нельзя назначить роль с правами шире ваших или менять сотрудника с более широкими правами.',
  VALIDATION_FAILED: 'Проверьте поля: почта, имя (от 3 символов), пароль (от 12 символов), у администратора филиала выбран филиал.',
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' }) : 'не входил');

/**
 * Сотрудники и роли (F-142, F-143). Список, создание, смена ролей, блокировка и новый пароль.
 * Роли, которые нельзя выдать, в списке недоступны; сервер проверяет то же самое.
 */
export function UsersAdminPage() {
  const data = useAdminData<UsersData>('/admin/users');
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setError(null);
    try {
      if (form.id) {
        await adminRequest('PATCH', `/admin/users/${form.id}`, { fullName: form.fullName, isActive: form.isActive, roles: form.roles, ...(form.password ? { password: form.password } : {}) }, form.updatedAt ? { 'If-Match': form.updatedAt } : {});
        setStatus(`Сотрудник ${form.email} сохранён.${!form.isActive ? ' Доступ заблокирован, сессии закрыты.' : ''}`);
      } else {
        await adminRequest('POST', '/admin/users', { email: form.email, fullName: form.fullName, password: form.password, roles: form.roles });
        setStatus(`Сотрудник ${form.email} создан. Передайте пароль лично, не по почте.`);
      }
      setForm(null);
      data.reload();
    } catch (e) {
      setError(e instanceof AdminApiError ? (ERRORS[e.code] ?? errorText(e)) : errorText(e));
    }
  };

  const roles = data.data?.roles ?? [];
  const setRole = (i: number, patch: Partial<RoleRef>) => form && setForm({ ...form, roles: form.roles.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  return (
    <>
      <AdminHeading title="Сотрудники">
        {!form ? <button type="button" className="btn-primary" onClick={() => { setStatus(null); setError(null); setForm({ id: null, updatedAt: null, email: '', fullName: '', password: '', isActive: true, roles: [{ code: 'editor', branchSlug: null }] }); }}>Добавить сотрудника</button> : null}
      </AdminHeading>
      <p className="mb-4 max-w-3xl">Роль администратора филиала действует только в выбранном филиале. Блокировка и новый пароль сразу закрывают все сессии сотрудника.</p>
      <p role="status" className="mb-2">{status}</p>
      <ErrorMessage error={data.error ?? (form ? null : error)} />

      {form ? (
        <form aria-label={form.id ? 'Правка сотрудника' : 'Новый сотрудник'} onSubmit={(e) => void save(e)} className="mb-8 flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <h2 className="text-xl font-semibold">{form.id ? `Сотрудник ${form.email}` : 'Новый сотрудник'}</h2>
          {!form.id ? (
            <div className="admin-field">
              <label htmlFor="u-email">Электронная почта</label>
              <input id="u-email" className="input" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          ) : null}
          <div className="admin-field">
            <label htmlFor="u-name">Фамилия, имя, отчество</label>
            <input id="u-name" className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="admin-field">
            <label htmlFor="u-password">{form.id ? 'Новый пароль (пусто — не менять)' : 'Пароль'}</label>
            <p id="u-password-hint" className="hint">Не короче 12 символов.</p>
            <input id="u-password" className="input" type="password" autoComplete="new-password" aria-describedby="u-password-hint" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="font-semibold">Роли</legend>
            {form.roles.map((r, i) => {
              const role = roles.find((x) => x.code === r.code);
              return (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="admin-field">
                    <label htmlFor={`u-role-${i}`}>Роль {i + 1}</label>
                    <select id={`u-role-${i}`} className="input" value={r.code} onChange={(e) => setRole(i, { code: e.target.value, branchSlug: roles.find((x) => x.code === e.target.value)?.branchScoped ? (data.data?.branches[0]?.slug ?? null) : null })}>
                      {roles.map((x) => <option key={x.code} value={x.code} disabled={!x.grantable}>{x.name}{x.grantable ? '' : ' (недоступно)'}</option>)}
                    </select>
                  </div>
                  {role?.branchScoped ? (
                    <div className="admin-field">
                      <label htmlFor={`u-branch-${i}`}>Филиал</label>
                      <select id={`u-branch-${i}`} className="input" value={r.branchSlug ?? ''} onChange={(e) => setRole(i, { branchSlug: e.target.value })}>
                        {(data.data?.branches ?? []).map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {form.roles.length > 1 ? <button type="button" className="btn-secondary" onClick={() => setForm({ ...form, roles: form.roles.filter((_, k) => k !== i) })}>Убрать роль {i + 1}</button> : null}
                </div>
              );
            })}
            <div><button type="button" className="btn-secondary" onClick={() => setForm({ ...form, roles: [...form.roles, { code: roles.find((x) => x.grantable)?.code ?? 'editor', branchSlug: null }] })}>Добавить роль</button></div>
          </fieldset>
          {form.id ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Доступ разрешён
            </label>
          ) : null}
          <ErrorMessage error={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">{form.id ? 'Сохранить' : 'Создать'}</button>
            <button type="button" className="btn-secondary" onClick={() => { setForm(null); setError(null); }}>Отмена</button>
          </div>
        </form>
      ) : null}

      {data.data ? (
        <div className="overflow-x-auto">
          <table className="admin-table">
            <thead><tr><th scope="col">Сотрудник</th><th scope="col">Роли</th><th scope="col">Состояние</th><th scope="col">Последний вход</th><th scope="col"><span className="visually-hidden">Действия</span></th></tr></thead>
            <tbody>
              {data.data.items.map((u) => {
                const manageable = u.roles.every((r) => roles.find((x) => x.code === r.code)?.grantable);
                return (
                  <tr key={u.id}>
                    <td>{u.fullName}<br /><span className="text-sm text-muted">{u.email}</span></td>
                    <td>{u.roles.map((r) => (r.branchName ? `${r.name} (${r.branchName})` : r.name)).join(', ')}</td>
                    <td>{!u.isActive ? 'Заблокирован' : u.locked ? 'Временно заблокирован после неудачных входов' : 'Активен'}</td>
                    <td>{when(u.lastLoginAt)}</td>
                    <td>
                      {manageable && u.id !== data.data?.me ? (
                        <button type="button" className="btn-secondary" aria-label={`Изменить: ${u.fullName}`}
                          onClick={() => { setStatus(null); setError(null); setForm({ id: u.id, updatedAt: u.updatedAt, email: u.email, fullName: u.fullName, password: '', isActive: u.isActive, roles: u.roles.map((r) => ({ code: r.code, branchSlug: r.branchSlug })) }); }}>
                          Изменить
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
