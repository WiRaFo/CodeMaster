import { useTranslation } from 'react-i18next';

/** Сообщения о загрузке и ошибке. role=status объявляет их экранному диктору без перевода фокуса. */
export function LoadStatus({ status }: { status: 'loading' | 'error' }) {
  const { t } = useTranslation();
  return (
    <p role="status" data-load-state={status} className={status === 'error' ? 'text-danger' : 'text-muted'}>
      {status === 'loading' ? t('common.loading') : t('common.loadError')}
    </p>
  );
}
