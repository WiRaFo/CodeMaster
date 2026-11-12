import { useState, type FormEvent } from 'react';
import type { AdminUser } from './AdminApp.tsx';
import { adminRequest, errorText } from './api.ts';

/** Вход сотрудника (F-140). Ошибка не уточняет, что неверно — email или пароль. */
export function LoginPage({ expired, onSignedIn }: { expired: boolean; onSignedIn: (me: AdminUser) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await adminRequest('POST', '/auth/login', { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') });
      // /auth/me возвращает и роли; после входа читаем его, чтобы данные совпадали с перезагрузкой страницы.
      onSignedIn(await adminRequest<AdminUser>('GET', '/auth/me'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="admin-main" className="mx-auto max-w-md px-4 py-10">
      <h1 className="mb-2 text-3xl font-bold">Вход в панель управления</h1>
      <p className="mb-6 text-muted">Только для сотрудников Государственного архива ВКО.</p>
      {expired ? <p role="status" className="mb-4 font-semibold">Сессия закончилась из-за долгого бездействия. Войдите снова.</p> : null}
      <form onSubmit={(e) => void submit(e)} noValidate>
        <div className="admin-field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" name="email" type="email" autoComplete="username" required className="input" />
        </div>
        <div className="admin-field">
          <label htmlFor="login-password">Пароль</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        {error ? <p role="alert" className="mb-4 font-semibold text-danger">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Вход…' : 'Войти'}</button>
      </form>
      <p className="mt-6"><a href="/ru">Вернуться на сайт</a></p>
    </main>
  );
}
