import * as Dialog from '@radix-ui/react-dialog';
import { Accessibility, X } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useA11y } from '../../app/A11yProvider.tsx';
import { useAnnounce } from '../../app/Announcer.tsx';
import { FONT_SCALES, LETTER_SPACINGS, LINE_HEIGHTS, MOTIONS, SCHEMES, type A11yPrefs } from '../../lib/a11y-prefs.ts';

/**
 * Панель настроек доступности (docs/accessibility.md §5): немодальная боковая панель на Radix Dialog.
 * Все настройки — нативные радиокнопки и флажки с видимыми подписями; изменения применяются сразу.
 */
export function A11yPanel() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const { prefs, update, reset } = useA11y();
  const announce = useAnnounce();

  const spacingLabel = (v: string, i: number) => (v === 'normal' ? t('a11y.spacingNormal') : i === 1 ? t('a11y.spacingWide') : t('a11y.spacingWidest'));
  const schemeLabels: Record<A11yPrefs['scheme'], string> = {
    system: t('a11y.schemeSystem'),
    light: t('a11y.schemeLight'),
    dark: t('a11y.schemeDark'),
    alt: t('a11y.schemeAlt'),
  };
  const motionLabels: Record<A11yPrefs['motion'], string> = {
    system: t('a11y.motionSystem'),
    reduce: t('a11y.motionReduce'),
    full: t('a11y.motionFull'),
  };

  return (
    <Dialog.Root modal={false}>
      <Dialog.Trigger className="btn-secondary">
        <Accessibility aria-hidden="true" className="size-5" />
        <span>{t('a11y.button')}</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l-2 border-border bg-surface p-5 text-text shadow-2xl"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="text-2xl font-bold">{t('a11y.title')}</Dialog.Title>
            <Dialog.Close className="btn-icon" aria-label={t('header.close')}>
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-muted">{t('a11y.description')}</Dialog.Description>
          <p className="rounded border border-border bg-surface-2 p-3">{t('a11y.sample')}</p>

          <RadioGroup legend={t('a11y.fontSize')} name="fontScale" value={String(prefs.fontScale)}
            options={FONT_SCALES.map((v) => ({ value: String(v), label: `${v} %` }))}
            onChange={(v) => update({ fontScale: Number(v) as A11yPrefs['fontScale'] })} />
          <RadioGroup legend={t('a11y.lineHeight')} name="lineHeight" value={prefs.lineHeight}
            options={LINE_HEIGHTS.map((v, i) => ({ value: v, label: spacingLabel(v, i) }))}
            onChange={(v) => update({ lineHeight: v as A11yPrefs['lineHeight'] })} />
          <RadioGroup legend={t('a11y.letterSpacing')} name="letterSpacing" value={prefs.letterSpacing}
            options={LETTER_SPACINGS.map((v, i) => ({ value: v, label: spacingLabel(v, i) }))}
            onChange={(v) => update({ letterSpacing: v as A11yPrefs['letterSpacing'] })} />
          <RadioGroup legend={t('a11y.scheme')} name="scheme" value={prefs.scheme}
            options={SCHEMES.map((v) => ({ value: v, label: schemeLabels[v] }))}
            onChange={(v) => update({ scheme: v as A11yPrefs['scheme'] })} />
          <RadioGroup legend={t('a11y.motion')} name="motion" value={prefs.motion}
            options={MOTIONS.map((v) => ({ value: v, label: motionLabels[v] }))}
            onChange={(v) => update({ motion: v as A11yPrefs['motion'] })} />

          <Toggle label={t('a11y.contrast')} checked={prefs.highContrast} onChange={(v) => update({ highContrast: v })} />
          <Toggle label={t('a11y.font')} checked={prefs.readableFont} onChange={(v) => update({ readableFont: v })} />
          <Toggle label={t('a11y.simplified')} hint={t('a11y.simplifiedHint')} checked={prefs.simplified}
            onChange={(v) => update({ simplified: v })} />

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <button type="button" className="btn-secondary" onClick={() => { reset(); announce(t('a11y.resetDone')); }}>
              {t('a11y.reset')}
            </button>
            <Link to={`/${lang}/accessibility`}>{t('a11y.moreInfo')}</Link>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RadioGroup(props: {
  legend: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{props.legend}</legend>
      <div className="flex flex-wrap gap-2">
        {props.options.map((o) => (
          <label key={o.value} className="choice">
            <input type="radio" name={props.name} value={o.value} checked={props.value === o.value}
              onChange={() => props.onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }): ReactNode {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label className="choice self-start">
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)}
          {...(props.hint ? { 'aria-describedby': hintId } : {})} />
        <span>{props.label}</span>
      </label>
      {props.hint ? <p id={hintId} className="text-sm text-muted">{props.hint}</p> : null}
    </div>
  );
}
