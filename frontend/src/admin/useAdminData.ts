import { useCallback, useEffect, useState } from 'react';
import { adminRequest, errorText } from './api.ts';

/** Загрузка данных панели; reload() — повторить после действия. */
export function useAdminData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setError(null);
    adminRequest<T>('GET', path)
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(errorText(e)));
    return () => {
      cancelled = true;
    };
  }, [path, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}
