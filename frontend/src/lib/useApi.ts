import { useEffect, useState } from 'react';
import { ApiRequestError, apiGet } from './api.ts';

export type ApiState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; notFound: boolean };

/** Загрузка данных по пути API; запрос отменяется при смене пути или уходе со страницы. path = null — не загружать. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading' });
  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    setState({ status: 'loading' });
    apiGet<T>(path, controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('API request failed', path, error);
        setState({ status: 'error', notFound: error instanceof ApiRequestError && error.status === 404 });
      });
    return () => controller.abort();
  }, [path]);
  return state;
}
