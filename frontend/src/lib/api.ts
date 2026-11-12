/** Единственная точка обращения к API. Ошибки приводятся к { code, message } (docs/architecture.md §5). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}) });
  if (!response.ok) {
    let code = 'INTERNAL';
    let message = response.statusText;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // Тело не JSON (например, прокси недоступен).
    }
    throw new ApiRequestError(response.status, code, message);
  }
  return (await response.json()) as T;
}
