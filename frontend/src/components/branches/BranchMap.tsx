import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { LatLng } from '../../lib/geo.ts';

export interface MapPoint extends LatLng {
  slug: string;
  name: string;
  href: string;
  isMain: boolean;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Карта подразделений (ТЗ §5.5, с. 7; F-060). Загружается отдельным чанком и только когда
 * у подразделений есть сверенные координаты. Карта дополняет список, но не заменяет его (F-066):
 * все адреса и ссылки доступны без неё.
 */
export default function BranchMap({ points, label }: { points: MapPoint[]; label: string }) {
  const { t } = useTranslation();
  const node = useRef<HTMLDivElement>(null);
  const detailsLabel = t('branches.details');

  useEffect(() => {
    if (!node.current || points.length === 0) return;
    const map = L.map(node.current, { scrollWheelZoom: false, keyboard: true });
    // Префикс подписи без значков: на официальном сайте — только текстовая ссылка на библиотеку.
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const markers = points.map((p) =>
      L.marker([p.lat, p.lng], {
        title: p.name,
        alt: p.name,
        keyboard: true,
        icon: L.divIcon({ className: p.isMain ? 'branch-marker branch-marker-main' : 'branch-marker', iconSize: [22, 22], iconAnchor: [11, 11] }),
      })
        .bindPopup(`<strong>${escapeHtml(p.name)}</strong><br><a href="${escapeHtml(p.href)}">${escapeHtml(detailsLabel)}</a>`)
        .addTo(map),
    );
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    if (points.length === 1) map.setView(bounds.getCenter(), 15);
    else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    return () => {
      for (const m of markers) m.remove();
      map.remove();
    };
  }, [points, detailsLabel]);

  return <div ref={node} role="region" aria-label={label} data-testid="branch-map" className="branch-map" />;
}
