import * as Dialog from '@radix-ui/react-dialog';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AdminApiError, adminRequest, configureAdminApi } from './api.ts';
import { AuditPage } from './AuditPage.tsx';
import { DashboardPage } from './DashboardPage.tsx';
import { DocumentEditPage } from './DocumentEditPage.tsx';
import { DocumentsPage } from './DocumentsPage.tsx';
import { HierarchyPage } from './HierarchyPage.tsx';
import { LoginPage } from './LoginPage.tsx';

export interface AdminUser {
  user: { id: string; email: string; fullName: string };
  roles?: Array<{ code: string; name: string; branchId: string | null }>;
  permissions: string[];
  csrfToken: string;
}

interface AuthState {
  me: AdminUser;
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
  /** Счётчик непрочитанных уведомлений обновляется после действий. */
  refreshNotifications: () => void;
  unread: number;
}

const AuthContext = createContext<AuthState | null>(null);
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AdminApp');
  return ctx;
}

/** Предупреждение за 5 минут до конца 30-минутного простоя (S-010). */
const IDLE_MS = 30 * 60 * 1000;
const WARN_MS = 25 * 60 * 1000;

/**
 * Панель управления (ТЗ §6; F-140). Отдельный бандл: загружается только по адресу /admin.
 * Страница закрыта от индексации, все проверки прав — на сервере; интерфейс лишь прячет недоступные кнопки.
 */
export function AdminApp() {
  const [me, setMe] = useState<AdminUser | null | 'loading'>('loading');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    document.documentElement.lang = 'ru';
    document.title = 'Панель управления — ГА ВКО';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.append(robots);
    return () => robots.remove();
  }, []);

  useEffect(() => {
    configureAdminApi({
      unauthenticated: () => {
        setExpired(true);
        setMe(null);
      },
    });
    adminRequest<AdminUser>('GET', '/auth/me')
      .then((data) => {
        configureAdminApi({ csrf: data.csrfToken });
        setMe(data);
      })
      .catch(() => setMe(null));
  }, []);

  if (me === 'loading') return <p className="p-6">Загрузка…</p>;
  if (me === null)
    return (
      <LoginPage
        expired={expired}
        onSignedIn={(data) => {
          configureAdminApi({ csrf: data.csrfToken });
          setExpired(false);
          setMe(data);
        }}
      />
    );
  return <SignedIn me={me} onSignedOut={() => setMe(null)} />;
}

function SignedIn({ me, onSignedOut }: { me: AdminUser; onSignedOut: () => void }) {
  const [unread, setUnread] = useState(0);
  const [warn, setWarn] = useState(false);
  const lastActivity = useRef(Date.now());
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const firstRender = useRef(true);

  const refreshNotifications = useCallback(() => {
    adminRequest<{ unread: number }>('GET', '/admin/notifications')
      .then((n) => setUnread(n.unread))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    configureAdminApi({ activity: () => (lastActivity.current = Date.now()) });
    refreshNotifications();
    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      setWarn(idle >= WARN_MS && idle < IDLE_MS);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshNotifications]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.querySelector<HTMLElement>('#admin-main h1')?.focus();
  }, [pathname]);

  const logout = useCallback(async () => {
    try {
      await adminRequest('POST', '/auth/logout');
    } finally {
      onSignedOut();
      navigate('/admin');
    }
  }, [navigate, onSignedOut]);

  const can = useCallback((p: string) => me.permissions.includes(p), [me.permissions]);
  const catalog = ['catalog:edit', 'catalog:submit', 'catalog:review', 'catalog:publish'].some(can);

  return (
    <AuthContext.Provider value={{ me, can, logout, refreshNotifications, unread }}>
      <a
        href="#admin-main"
        className="visually-hidden focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-3 focus:text-text focus:shadow-lg"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('admin-main')?.focus();
        }}
      >
        Перейти к основному содержимому
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-lg font-bold">Панель управления ГА ВКО</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              {me.user.fullName}
              {me.roles?.length ? <span className="text-muted"> · {me.roles.map((r) => r.name).join(', ')}</span> : null}
            </span>
            <button type="button" className="btn-secondary" onClick={() => void logout()}>Выйти</button>
          </div>
        </div>
        <nav aria-label="Разделы панели" className="mx-auto max-w-7xl px-4 pb-2">
          <ul className="flex flex-wrap gap-1">
            <AdminNavItem to="/admin" end label={unread ? `Обзор (${unread} новых)` : 'Обзор'} />
            {catalog ? <AdminNavItem to="/admin/documents" label="Документы" /> : null}
            {catalog ? <AdminNavItem to="/admin/hierarchy" label="Фонды, описи, дела" /> : null}
            {can('audit:read') ? <AdminNavItem to="/admin/audit" label="Журнал действий" /> : null}
            <li>
              <a className="admin-nav-link" href="/ru">Открыть сайт</a>
            </li>
          </ul>
        </nav>
      </header>
      <main id="admin-main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 focus:outline-none">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="documents" element={catalog ? <DocumentsPage /> : <NoAccess />} />
          <Route path="documents/new" element={can('catalog:edit') ? <DocumentEditPage /> : <NoAccess />} />
          <Route path="documents/:id" element={catalog ? <DocumentEditPage /> : <NoAccess />} />
          <Route path="hierarchy" element={catalog ? <HierarchyPage /> : <NoAccess />} />
          <Route path="audit" element={can('audit:read') ? <AuditPage /> : <NoAccess />} />
          <Route path="*" element={<AdminHeading title="Раздел не найден" />} />
        </Routes>
      </main>
      <Dialog.Root open={warn} onOpenChange={setWarn}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-40 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-surface p-5 text-text">
            <Dialog.Title className="mb-2 text-xl font-bold">Сессия скоро закончится</Dialog.Title>
            <Dialog.Description className="mb-4">Через несколько минут без действий потребуется войти снова. Несохранённые изменения пропадут.</Dialog.Description>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                void adminRequest('GET', '/auth/me').then(() => setWarn(false));
              }}
            >
              Продлить сессию
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </AuthContext.Provider>
  );
}

function AdminNavItem({ to, label, end }: { to: string; label: string; end?: boolean }) {
  return (
    <li>
      <NavLink to={to} end={end ?? false} className="admin-nav-link">
        {label}
      </NavLink>
    </li>
  );
}

export function AdminHeading({ title, children }: { title: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} — панель управления ГА ВКО`;
  }, [title]);
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 tabIndex={-1} className="text-3xl font-bold focus:outline-none">{title}</h1>
      {children}
    </div>
  );
}

function NoAccess() {
  return (
    <>
      <AdminHeading title="Нет доступа" />
      <p>У вашей роли нет прав на этот раздел. Обратитесь к главному администратору.</p>
    </>
  );
}

/** Ошибка формы или действия: объявляется диктору и видна рядом с кнопками. */
export function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="my-3 rounded border-2 border-danger p-3 font-semibold text-danger">
      {error}
    </p>
  );
}

export const isAdminApiError = (e: unknown): e is AdminApiError => e instanceof AdminApiError;
