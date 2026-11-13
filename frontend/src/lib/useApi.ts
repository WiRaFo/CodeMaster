import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, apiGet } from './api.ts';

/** previous — данные прошлого запроса, пока идёт новый (чтобы список фильтров не исчезал и не терялся фокус). */
export type ApiState<T> = { status: 'loading'; previous: T | null } | { status: 'ready'; data: T } | { status: 'error'; notFound: boolean };

/** Загрузка данных по пути API; запрос отменяется при смене пути или уходе со страницы. path = null — не загружать. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ status: 'loading', previous: null });
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    // Смена только языка (?lang=): прежний ответ остаётся на экране до прихода нового, страница не схлопывается и не прыгает.
    const sameExceptLang = lastPath.current !== null && withoutLang(lastPath.current) === withoutLang(path);
    lastPath.current = path;
    if (!sameExceptLang) setState((prev) => ({ status: 'loading', previous: prev.status === 'ready' ? prev.data : prev.status === 'loading' ? prev.previous : null }));
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

/** Данные ответа или, пока идёт новый запрос, данные предыдущего. */
export function dataOrPrevious<T>(state: ApiState<T>): T | null {
  if (state.status === 'ready') return state.data;
  if (state.status === 'loading') return state.previous;
  return null;
}

const withoutLang = (path: string) => path.replace(/([?&])lang=[^&]*&?/, '$1').replace(/[?&]$/, '');
