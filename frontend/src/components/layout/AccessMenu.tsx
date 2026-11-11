import { Accessibility, Pause, Play } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useA11y } from '../../app/A11yProvider.tsx';
import { TEXTS } from '../../lib/a11y-prefs.ts';

/** Буква-образец размера текста. */
const GLYPH = 'A';

/**
 * Меню доступности вместо отдельных кнопок: размер текста, версия для слабовидящих, пауза анимации, сброс.
 * Раскрывающийся блок (кнопка с aria-expanded): закрывается по Esc и по щелчку вне него, фокус возвращается на кнопку.
 * variant: main — кнопка в шапке, top — компактная в верхней строке (телефон), bar — в панели при прокрутке.
 */
export function AccessMenu({ variant, tabIndex }: { variant: 'main' | 'top' | 'bar'; tabIndex?: number }) {
  const { t } = useTranslation();
  const { prefs, update, reset } = useA11y();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const label = t('access.menu');
  const triggerClass = variant === 'top' ? 'a11y-top' : variant === 'bar' ? 'a11y-btn a11y-btn-bar' : 'a11y-btn';
  const textLabel: Record<(typeof TEXTS)[number], string> = { m: t('access.textM'), l: t('access.textL'), xl: t('access.textXl') };

  return (
    <div ref={root} className={`am am-${variant}${variant === 'top' ? ' show-m' : variant === 'main' ? ' hide-m' : ''}`}>
      <button ref={trigger} type="button" className={triggerClass} aria-expanded={open} aria-controls={panelId} aria-label={t('access.menuAria')}
        tabIndex={tabIndex} onClick={() => setOpen((v) => !v)}>
        {variant === 'top' ? <Accessibility aria-hidden="true" className="size-[18px]" /> : <span className="a11y-ico"><Accessibility aria-hidden="true" className="size-[22px]" /></span>}
        {label}
      </button>
      {open ? (
        <div id={panelId} className="am-panel" role="group" aria-label={t('access.menuAria')}>
          {prefs.mode ? (
            <p className="am-note m-0">{t('access.sizeInMode')}</p>
          ) : (
            <div role="group" aria-label={t('access.textSize')}>
              <p className="am-h">{t('access.textSize')}</p>
              <div className="am-row">
                {TEXTS.map((size, i) => (
                  <button key={size} type="button" className="am-opt" aria-pressed={prefs.text === size} onClick={() => update({ text: size })}>
                    <span className={`a${i + 1}`} aria-hidden="true">{GLYPH}</span>
                    <span className="sr-only">{textLabel[size]}</span>
                    <span className="block text-[calc(13px*var(--fs,1))] font-semibold" aria-hidden="true">{textLabel[size]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <button type="button" className="am-switch" aria-pressed={prefs.mode} onClick={() => update({ mode: !prefs.mode })}>
              <span>{t('access.modeTitle')}</span><span className="knob" aria-hidden="true" />
            </button>
            <p className="am-note">{t('access.modeHint')}</p>
          </div>
          <button type="button" className="am-switch" aria-pressed={prefs.still} onClick={() => update({ still: !prefs.still })}>
            <span className="d-row gap-2">
              {prefs.still ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
              {t(prefs.still ? 'header.motionStart' : 'header.motionStop')}
            </span>
            <span className="knob" aria-hidden="true" />
          </button>
          <button type="button" className="am-reset" onClick={reset}>{t('access.reset')}</button>
        </div>
      ) : null}
    </div>
  );
}
