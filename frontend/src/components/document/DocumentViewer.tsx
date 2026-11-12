import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { DocumentPageItem } from '../../lib/types.ts';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

/**
 * Просмотр цифровой копии (F-041, F-042; docs/accessibility.md §7): листание кнопками и стрелками,
 * масштаб кнопками и клавишами «+»/«−», счётчик страниц объявляется диктору. Изображение берётся
 * только через публичный маршрут API; скачивание не предлагается (downloadAllowed пока везде false).
 */
export function DocumentViewer({ documentId, pages }: { documentId: string; pages: DocumentPageItem[] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const page = pages[index];
  if (!page) return null;

  const go = (next: number) => setIndex(Math.min(pages.length - 1, Math.max(0, next)));
  const zoomBy = (delta: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => go(index - 1),
      ArrowRight: () => go(index + 1),
      Home: () => go(0),
      End: () => go(pages.length - 1),
      '+': () => zoomBy(ZOOM_STEP),
      '=': () => zoomBy(ZOOM_STEP),
      '-': () => zoomBy(-ZOOM_STEP),
      '0': () => setZoom(1),
    };
    const action = actions[e.key];
    if (action && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      action();
    }
  };

  const counter = page.sheetLabel
    ? t('document.viewer.pageOfSheet', { page: index + 1, total: pages.length, sheet: page.sheetLabel })
    : t('document.viewer.pageOf', { page: index + 1, total: pages.length });

  return (
    <div className="document-viewer">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2" role="toolbar" aria-label={t('document.viewer.toolbar')} aria-controls="viewer-stage">
        <button type="button" className="btn-icon" onClick={() => go(index - 1)} disabled={index === 0} aria-label={t('document.viewer.prev')}>
          <ChevronLeft aria-hidden="true" className="size-6" />
        </button>
        <p aria-live="polite" aria-atomic="true" className="min-w-0 px-1 font-semibold" data-testid="viewer-counter">{counter}</p>
        <button type="button" className="btn-icon" onClick={() => go(index + 1)} disabled={index === pages.length - 1} aria-label={t('document.viewer.next')}>
          <ChevronRight aria-hidden="true" className="size-6" />
        </button>
        <span className="mx-1 hidden h-6 w-px bg-border sm:inline-block" aria-hidden="true" />
        <button type="button" className="btn-icon" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label={t('document.viewer.zoomOut')}>
          <ZoomOut aria-hidden="true" className="size-6" />
        </button>
        <output className="w-14 text-center tabular-nums" aria-label={t('document.viewer.zoomLevel')}>{Math.round(zoom * 100)}%</output>
        <button type="button" className="btn-icon" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label={t('document.viewer.zoomIn')}>
          <ZoomIn aria-hidden="true" className="size-6" />
        </button>
        <button type="button" className="btn-icon" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label={t('document.viewer.zoomReset')}>
          <RotateCcw aria-hidden="true" className="size-5" />
        </button>
      </div>
      {/* Область прокрутки получает фокус, чтобы увеличенную страницу можно было двигать с клавиатуры. */}
      <div
        id="viewer-stage"
        className="viewer-stage"
        tabIndex={0}
        role="region"
        aria-label={t('document.viewer.stage')}
        aria-describedby="viewer-keys"
        onKeyDown={onKeyDown}
      >
        <img
          key={page.assetId}
          src={`/api/v1/catalog/documents/${documentId}/pages/${page.pageNumber}/image`}
          alt={page.alt ?? t('document.viewer.fallbackAlt', { page: index + 1 })}
          {...(page.altLang ? { lang: page.altLang } : {})}
          width={page.width ?? undefined}
          height={page.height ?? undefined}
          style={{ width: `${zoom * 100}%` }}
          className="viewer-image"
          draggable={false}
        />
      </div>
      <p id="viewer-keys" className="p-2 text-sm text-muted">{t('document.viewer.keys')}</p>
    </div>
  );
}
