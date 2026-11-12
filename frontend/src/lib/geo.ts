/** Координаты в градусах WGS 84. */
export interface LatLng {
  lat: number;
  lng: number;
}

export type TravelMode = 'driving' | 'walking' | 'transit';
export const TRAVEL_MODES: readonly TravelMode[] = ['driving', 'walking', 'transit'];

const EARTH_RADIUS_KM = 6371.0088;
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Расстояние по прямой (формула гаверсинуса; ТЗ §5.5, с. 8; матрица F-064, Q-09).
 * Это не длина маршрута: на странице значение всегда подписано «по прямой».
 */
export function straightDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Точка маршрута: координаты, если они сверены, иначе адрес текстом. */
export type RoutePoint = LatLng | string;

const pointText = (p: RoutePoint) => (typeof p === 'string' ? p : `${p.lat},${p.lng}`);

/**
 * Ссылка на маршрут в Google Картах (Maps URLs, api=1). Без отправной точки сервис предложит
 * местоположение пользователя сам; сайт его не запрашивает.
 */
export function googleRouteUrl(destination: RoutePoint, mode: TravelMode, origin?: RoutePoint | null): string {
  const q = new URLSearchParams({ api: '1', destination: pointText(destination), travelmode: mode });
  if (origin) q.set('origin', pointText(origin));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

const TWO_GIS_TAB: Record<TravelMode, string> = { driving: 'car', walking: 'pedestrian', transit: 'bus' };

/**
 * Ссылка в 2ГИС. Маршрут 2ГИС строит только между координатами (порядок «долгота,широта»);
 * без координат назначения открывается поиск по адресу.
 */
export function twoGisUrl(destination: RoutePoint, mode: TravelMode, origin?: RoutePoint | null): string {
  if (typeof destination === 'string') return `https://2gis.kz/search/${encodeURIComponent(destination)}`;
  const from = origin && typeof origin !== 'string' ? `${origin.lng},${origin.lat}` : '';
  return `https://2gis.kz/directions/tab/${TWO_GIS_TAB[mode]}/points/${encodeURIComponent(`${from}|${destination.lng},${destination.lat}`)}`;
}
