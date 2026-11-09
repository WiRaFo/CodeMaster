/**
 * Запросы панели управления. Сессия — в cookie HttpOnly (скрипт её не видит), изменяющие запросы
 * несут X-CSRF-Token (docs/api-design.md §4). Ответ 401 означает, что сессия закончилась.
 */
export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Array<{ path: Array<string | number>; code: string }> = [],
  ) {
    super(message);
  }
}

let csrfToken = '';
let onUnauthenticated: () => void = () => undefined;
let onActivity: () => void = () => undefined;

export function configureAdminApi(opts: { csrf?: string; unauthenticated?: () => void; activity?: () => void }): void {
  if (opts.csrf !== undefined) csrfToken = opts.csrf;
  if (opts.unauthenticated) onUnauthenticated = opts.unauthenticated;
  if (opts.activity) onActivity = opts.activity;
}

export async function adminRequest<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' ? {} : { 'X-CSRF-Token': csrfToken }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 && !path.startsWith('/auth/')) onUnauthenticated();
  if (!response.ok) {
    let error: { code?: string; message?: string; details?: AdminApiError['details'] } = {};
    try {
      error = ((await response.json()) as { error?: typeof error }).error ?? {};
    } catch {
      // не JSON
    }
    throw new AdminApiError(response.status, error.code ?? 'INTERNAL', error.message ?? response.statusText, error.details ?? []);
  }
  onActivity();
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Понятный текст ошибки для сотрудника. */
export function errorText(error: unknown): string {
  if (!(error instanceof AdminApiError)) return 'Не удалось выполнить действие. Проверьте соединение и повторите.';
  const byCode: Record<string, string> = {
    INVALID_CREDENTIALS: 'Неверный email или пароль.',
    TOO_MANY_ATTEMPTS: 'Слишком много попыток входа. Подождите и попробуйте снова.',
    UNAUTHENTICATED: 'Сессия закончилась. Войдите снова.',
    FORBIDDEN: 'Недостаточно прав для этого действия.',
    CSRF_FAILED: 'Запрос отклонён проверкой безопасности. Обновите страницу.',
    INVALID_STATUS_TRANSITION: 'Это действие недоступно в текущем статусе. Обновите страницу.',
    INCOMPLETE_RECORD: 'Заполните обязательные поля.',
    CONFIRMATION_REQUIRED: 'Действие нужно подтвердить.',
    CONFLICT: 'Запись уже изменена другим сотрудником или такой номер уже есть. Обновите страницу.',
    VALIDATION_FAILED: 'Проверьте заполнение полей.',
    NOT_FOUND: 'Запись не найдена.',
    UNSUPPORTED_FILE: 'Можно загрузить только изображения JPEG, PNG или WebP.',
  };
  return byCode[error.code] ?? 'Ошибка сервера. Повторите позже.';
}

/** Загрузка файла телом запроса (без multipart); тип проверяет сервер по сигнатуре. */
export async function adminUpload<T>(path: string, file: File): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-CSRF-Token': csrfToken, 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  });
  if (response.status === 401) onUnauthenticated();
  if (!response.ok) {
    let error: { code?: string; message?: string } = {};
    try {
      error = ((await response.json()) as { error?: typeof error }).error ?? {};
    } catch {
      // не JSON
    }
    throw new AdminApiError(response.status, response.status === 415 ? 'UNSUPPORTED_FILE' : (error.code ?? 'INTERNAL'), error.message ?? response.statusText);
  }
  onActivity();
  return (await response.json()) as T;
}
