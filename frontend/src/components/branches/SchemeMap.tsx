import { ExternalLink, Landmark, Mail, MapPin, Phone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { telHref } from '../../lib/main-branch.ts';
import type { BranchSummary } from '../../lib/types.ts';
import { MAP_REGIONS, MAP_VIEWBOX } from './map-regions.ts';

/**
 * Схема области с метками подразделений (макет заказчика, 12.11.2026). Это не географическая карта:
 * метки стоят в районе филиала примерно, без координат. Окно метки: название, адрес, телефон, почта,
 * переход в 2ГИС (поиск по названию и адресу, без координат) и на карточку подразделения.
 * Все сведения те же, что в списке ниже, поэтому схема — дополнение, а не единственный путь.
 */

/** Место метки на схеме, % от ширины и высоты рисунка (острие метки). */
const SPOTS: Record<string, { x: number; y: number }> = {
  'ust-kamenogorsk': { x: 29.5, y: 37.4 },
  shemonaikha: { x: 20.3, y: 17.4 },
  ridder: { x: 43.7, y: 22.3 },
  glubokoe: { x: 33.6, y: 19.2 },
  ulan: { x: 13, y: 38.5 },
  altai: { x: 48.8, y: 37 },
  'ulken-naryn': { x: 56.1, y: 51.2 },
  'katon-karagay': { x: 77, y: 48.6 },
  samar: { x: 36.3, y: 56.1 },
  kurchum: { x: 52.6, y: 67.2 },
  markakol: { x: 73.7, y: 66.1 },
  tarbagatai: { x: 41.8, y: 86.9 },
  zaisan: { x: 60.6, y: 89.1 },
};
/** Подразделения в Усть-Каменогорске показываются одной меткой областного центра. */
const UK = new Set(['main', 'main-krylova', 'ust-kamenogorsk-personnel']);
const spotKey = (slug: string) => (UK.has(slug) ? 'ust-kamenogorsk' : slug);

export const twoGisHref = (b: Pick<BranchSummary, 'name' | 'address'>) =>
  `https://2gis.kz/search/${encodeURIComponent([b.name, b.address].filter(Boolean).join(', '))}`;

export function SchemeMap({ branches, lang }: { branches: BranchSummary[]; lang: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const groups = new Map<string, BranchSummary[]>();
  for (const b of branches) {
    const key = spotKey(b.slug);
    if (!SPOTS[key]) continue;
    groups.set(key, [...(groups.get(key) ?? []), b].sort((a, c) => Number(c.isMain) - Number(a.isMain)));
  }

  const close = () => {
    setOpen(null);
    opener.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const spot = open ? SPOTS[open] : null;
  const items = open ? groups.get(open) ?? [] : [];

  return (
    <div className="smap" data-testid="scheme-map">
      <div className="smap-stage" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
        {/* Векторная схема: районы подсвечиваются при наведении; щелчок по району открывает его подразделение (дублирует метку). */}
        <svg className="smap-svg" viewBox={MAP_VIEWBOX} aria-hidden="true" focusable="false">
          {MAP_REGIONS.map((r) => (
            <path key={r.key} d={r.d} fill={r.fill}
              className={`smap-reg${groups.has(r.key) ? ' live' : ''}${hot === r.key || open === r.key ? ' hot' : ''}`}
              onMouseEnter={() => setHot(r.key)} onMouseLeave={() => setHot(null)}
              onClick={() => { if (groups.has(r.key)) { opener.current = null; setOpen(open === r.key ? null : r.key); } }} />
          ))}
        </svg>
        {[...groups].map(([key, list]) => {
          const main = list.some((b) => b.isMain);
          const p = SPOTS[key]!;
          const name = list[0]!.shortName ?? list[0]!.name ?? key;
          return (
            <button key={key} type="button" className={`smap-pin${main ? ' main' : ''}${open === key ? ' on' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%` }} aria-expanded={open === key} aria-controls="smap-panel"
              aria-label={list.length > 1 ? t('branchMap.pinMany', { name, count: list.length }) : name}
              onMouseEnter={() => setHot(key)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(key)} onBlur={() => setHot(null)}
              onClick={(e) => { opener.current = e.currentTarget; setOpen(open === key ? null : key); }}>
              <span className="smap-drop"><Landmark aria-hidden="true" className={main ? 'size-6' : 'size-5'} /></span>
              {main ? <span className="smap-tag">{t('branchMap.central')}</span> : null}
            </button>
          );
        })}

        {open && spot ? (
          <div id="smap-panel" ref={panel} tabIndex={-1} role="dialog" aria-label={items[0]?.name ?? ''}
            className={`smap-pop${spot.x > 60 ? ' left' : ''}${spot.y < 50 ? ' below' : ''}`}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
            <button type="button" className="smap-x" onClick={close} aria-label={t('branchMap.close')}><X aria-hidden="true" className="size-5" /></button>
            {items.map((b) => (
              <section key={b.slug} className="smap-item">
                <h3 className="smap-name">{b.name ?? b.slug}</h3>
                {b.address ? <p className="smap-line"><MapPin aria-hidden="true" className="size-4" /><span>{b.address}</span></p> : null}
                {b.phone ? <p className="smap-line"><Phone aria-hidden="true" className="size-4" /><a href={telHref(b.phone)}>{b.phone}</a></p> : null}
                {b.email ? <p className="smap-line"><Mail aria-hidden="true" className="size-4" /><a href={`mailto:${b.email}`}>{b.email}</a></p> : null}
                <div className="smap-acts">
                  <a className="btn sm" href={twoGisHref(b)} target="_blank" rel="noopener noreferrer">
                    {t('branchMap.open2gis')}<ExternalLink aria-hidden="true" className="size-4" />
                    <span className="sr-only"> {t('branchMap.newTab')}</span>
                  </a>
                  <Link className="btn line sm" to={`/${lang}/branches/${b.slug}`}>{t('branchMap.more')}</Link>
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
