/**
 * Обезличенная аналитика (ТЗ §5.8 Д; F-126, S-032): браузер сообщает только адрес открытой страницы
 * или ошибки. Ни cookies, ни идентификаторов; при «Не отслеживать» ничего не отправляется.
 */
function send(path: string, body: Record<string, string>): void {
  if (import.meta.env.MODE === 'test') return;
  if (navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
  fetch(`/api/v1${path}`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => undefined);
}

export const reportView = (path: string) => send('/analytics/view', { path });
export const reportError = (kind: 'not_found' | 'load_failed', path: string) => send('/analytics/error', { kind, path });
