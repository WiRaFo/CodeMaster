import { useTranslation } from 'react-i18next';
import { useA11y } from '../../app/A11yProvider.tsx';
import type { A11yPrefs } from '../../lib/a11y-prefs.ts';

const SCHEME_SWATCH: Record<A11yPrefs['scheme'], string> = {
  bw: 'bg-white text-black',
  wb: 'bg-black text-white',
  blue: 'bg-[#9dd1ff] text-[#063462]',
};

/**
 * Жёлтая панель версии для слабовидящих (дизайн 11.11.2026, Header.dc.html): размер текста, цвет, выход.
 * Видна только в этом режиме (html.a11y .a11y-note), настройки хранятся в браузере (lib/a11y-prefs.ts).
 */
export function LowVisionBar() {
  const { t } = useTranslation();
  const { prefs, update } = useA11y();
  if (!prefs.mode) return null;
  const option = (pressed: boolean, label: string, onClick: () => void, swatch?: string) => (
    <button key={label} type="button" className="a11y-opt" aria-pressed={pressed} onClick={onClick}>
      {swatch ? <span className={`a11y-sw ${swatch}`} aria-hidden="true">{t('lowVision.swatch')}</span> : null}
      {label}
    </button>
  );
  return (
    <div className="a11y-note" role="region" aria-label={t('lowVision.region')}>
      <div className="wrap a11y-panel">
        <div className="a11y-grp" role="group" aria-label={t('lowVision.size')}>
          <span>{t('lowVision.size')}:</span>
          {(['l', 'xl'] as const).map((size) =>
            option(prefs.size === size, t(size === 'l' ? 'lowVision.sizeL' : 'lowVision.sizeXl'), () => update({ size })))}
        </div>
        <div className="a11y-grp a11y-grp-color" role="group" aria-label={t('lowVision.colorGroup')}>
          <span>{t('lowVision.color')}:</span>
          {(['bw', 'wb', 'blue'] as const).map((scheme) =>
            option(prefs.scheme === scheme, t(`lowVision.${scheme}`), () => update({ scheme }), SCHEME_SWATCH[scheme]))}
        </div>
        <button type="button" className="a11y-exit" onClick={() => update({ mode: false })}>{t('lowVision.exit')}</button>
      </div>
    </div>
  );
}
