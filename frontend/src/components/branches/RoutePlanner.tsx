import { ExternalLink, LocateFixed } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TRAVEL_MODES, googleRouteUrl, straightDistanceKm, twoGisUrl, type LatLng, type TravelMode } from '../../lib/geo.ts';

type Origin = { kind: 'none' } | { kind: 'locating' } | { kind: 'here'; at: LatLng } | { kind: 'denied' };

/**
 * «Как добраться» (ТЗ §5.5, с. 8; F-063–F-065). Местоположение запрашивается только по нажатию кнопки;
 * отказ не ломает страницу — остаётся поле адреса. Маршрут строит внешний сервис по ссылке.
 * Расстояние считается по прямой и только между сверенными координатами.
 */
export function RoutePlanner({ address, coordinates }: { address: string; coordinates: LatLng | null }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [mode, setMode] = useState<TravelMode>('driving');
  const [from, setFrom] = useState('');
  const [origin, setOrigin] = useState<Origin>({ kind: 'none' });
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const locate = () => {
    setOrigin({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ kind: 'here', at: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => setOrigin({ kind: 'denied' }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  };

  const destination = coordinates ?? address;
  const start = origin.kind === 'here' ? origin.at : from.trim() || null;
  const distance = coordinates && origin.kind === 'here' ? straightDistanceKm(origin.at, coordinates) : null;
  const km = distance === null ? null : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: distance < 10 ? 1 : 0 }).format(distance);

  return (
    <section aria-labelledby={`${id}-h`} className="mb-8 rounded-md border-2 border-border bg-surface p-4">
      <h2 id={`${id}-h`} className="mb-3 text-xl font-semibold">{t('branches.route.title')}</h2>
      <fieldset className="mb-4">
        <legend className="mb-1 font-semibold">{t('branches.route.mode')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {TRAVEL_MODES.map((m) => (
            <label key={m} className="flex min-h-11 items-center gap-2">
              <input type="radio" name={`${id}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} className="size-5" />
              {t(`branches.route.modes.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mb-4 flex flex-col gap-2">
        <label htmlFor={`${id}-from`} className="font-semibold">{t('branches.route.from')}</label>
        <p id={`${id}-from-hint`} className="text-sm text-muted">{t('branches.route.fromHint')}</p>
        <input
          id={`${id}-from`}
          type="text"
          className="input max-w-xl"
          value={origin.kind === 'here' ? t('branches.route.here') : from}
          readOnly={origin.kind === 'here'}
          aria-describedby={`${id}-from-hint`}
          autoComplete="street-address"
          onChange={(e) => setFrom(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {canLocate ? (
            <button type="button" className="btn-secondary" onClick={locate} disabled={origin.kind === 'locating'}>
              <LocateFixed aria-hidden="true" className="size-5" />
              {origin.kind === 'locating' ? t('branches.route.locating') : t('branches.route.locate')}
            </button>
          ) : null}
          {origin.kind === 'here' ? (
            <button type="button" className="btn-secondary" onClick={() => setOrigin({ kind: 'none' })}>{t('branches.route.clearHere')}</button>
          ) : null}
        </div>
        <p role="status" className="text-sm">
          {origin.kind === 'denied' ? t('branches.route.denied') : null}
        </p>
      </div>

      {km !== null ? (
        <p className="mb-2 font-semibold" data-testid="straight-distance">{t('branches.route.distance', { km })}</p>
      ) : null}
      <p className="mb-4 text-sm text-muted">{coordinates ? t('branches.route.distanceNote') : t('branches.route.noCoordinates')}</p>

      <div className="flex flex-wrap gap-2">
        <a className="btn-primary" href={googleRouteUrl(destination, mode, start)} target="_blank" rel="noopener noreferrer">
          {t('branches.route.google')}
          <ExternalLink aria-hidden="true" className="size-4" />
          <span className="visually-hidden">{t('common.newTab')}</span>
        </a>
        <a className="btn-secondary" href={twoGisUrl(destination, mode, origin.kind === 'here' ? origin.at : null)} target="_blank" rel="noopener noreferrer">
          {t('branches.route.twoGis')}
          <ExternalLink aria-hidden="true" className="size-4" />
          <span className="visually-hidden">{t('common.newTab')}</span>
        </a>
      </div>
      <p className="mt-3 text-sm text-muted">{t('branches.route.external')}</p>
    </section>
  );
}
