import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { reportError } from '../../lib/analytics.ts';

/** Сообщения о загрузке и ошибке. role=status объявляет их экранному диктору без перевода фокуса. */
export function LoadStatus({ status }: { status: 'loading' | 'error' }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (status === 'error') reportError('load_failed', window.location.pathname);
  }, [status]);
  return (
    <p role="status" data-load-state={status} className={status === 'error' ? 'text-danger' : 'text-muted'}>
      {status === 'loading' ? t('common.loading') : t('common.loadError')}
    </p>
  );
}
