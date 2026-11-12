import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { FEEDBACK_TOPICS } from '@archive-vko/shared/enums';
import { PageHeading } from '../components/shared/PageHeading.tsx';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; reason: 'invalid' | 'tooMany' | 'network' };

/**
 * Отзывы и предложения о сайте (разрешены организаторами хакатона). Это не обращение и не заявление:
 * форма об этом прямо говорит, ответ не обещается. Почта необязательна и сохраняется только с согласием.
 * Ошибки показываются текстом у полей и в сводке, фокус переводится на сводку (WCAG 3.3.1).
 */
export function FeedbackPage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const location = useLocation();
  const id = useId();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const from = (location.state as { from?: string } | null)?.from;

  const submit = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const value = (k: string) => String(data.get(k) ?? '').trim();
    const next: Record<string, string> = {};
    if (!value('topic')) next['topic'] = t('feedback.errors.topic');
    if (value('message').length < 10) next['message'] = t('feedback.errors.message');
    if (value('contactEmail') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('contactEmail'))) next['contactEmail'] = t('feedback.errors.email');
    if (value('contactEmail') && data.get('consent') !== 'on') next['consent'] = t('feedback.errors.consent');
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setState({ kind: 'error', reason: 'invalid' });
      requestAnimationFrame(() => document.getElementById(`${id}-summary`)?.focus());
      return;
    }
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          topic: value('topic'),
          message: value('message'),
          contactEmail: value('contactEmail'),
          consent: data.get('consent') === 'on',
          website: value('website'),
          lang,
          ...(from && from.startsWith('/') ? { pagePath: from.slice(0, 300) } : {}),
        }),
      });
      if (res.status === 202) {
        setState({ kind: 'sent' });
        form.reset();
        requestAnimationFrame(() => document.getElementById(`${id}-sent`)?.focus());
      } else setState({ kind: 'error', reason: res.status === 429 ? 'tooMany' : res.status === 400 ? 'invalid' : 'network' });
    } catch {
      setState({ kind: 'error', reason: 'network' });
    }
  };

  const field = (name: string) => (errors[name] ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-${name}-err` } : {});
  const errorText = (name: string) => (errors[name] ? <p id={`${id}-${name}-err`} className="text-sm font-semibold text-danger">{errors[name]}</p> : null);

  return (
    <>
      <PageHeading title={t('nav.feedback')}>
        <p className="mt-2 max-w-3xl">{t('feedback.lead')}</p>
      </PageHeading>
      <p className="mb-6 max-w-3xl rounded-md border-2 border-warning-text bg-warning-bg p-3 text-warning-text">
        {t('feedback.notAppeal')} <Link to={`/${lang}/branches`} className="text-warning-text underline">{t('nav.branches')}</Link>
      </p>

      {state.kind === 'sent' ? (
        <p id={`${id}-sent`} tabIndex={-1} role="status" className="mb-6 max-w-3xl rounded-md border-2 border-primary bg-surface p-3 font-semibold">{t('feedback.sent')}</p>
      ) : null}
      {state.kind === 'error' ? (
        <div id={`${id}-summary`} tabIndex={-1} role="alert" className="mb-6 max-w-3xl rounded-md border-2 border-danger bg-surface p-3">
          <p className="font-semibold">{t(`feedback.failed.${state.reason}`)}</p>
          {Object.keys(errors).length > 0 ? <ul className="mt-1 list-disc pl-6">{Object.values(errors).map((e) => <li key={e}>{e}</li>)}</ul> : null}
        </div>
      ) : null}

      <form
        noValidate
        className="flex max-w-3xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <label className="flex flex-col gap-1 font-semibold">
          {t('feedback.topic')}
          <select name="topic" defaultValue="" className="input max-w-full font-normal" {...field('topic')}>
            <option value="" disabled>{t('feedback.chooseTopic')}</option>
            {FEEDBACK_TOPICS.map((x) => <option key={x} value={x}>{t(`feedback.topics.${x}`)}</option>)}
          </select>
        </label>
        {errorText('topic')}
        <label className="flex flex-col gap-1 font-semibold">
          {t('feedback.message')}
          <span className="text-sm font-normal text-muted">{t('feedback.messageHint')}</span>
          <textarea name="message" rows={6} maxLength={2000} className="input max-w-full font-normal" {...field('message')} />
        </label>
        {errorText('message')}
        <label className="flex flex-col gap-1 font-semibold">
          {t('feedback.email')}
          <span className="text-sm font-normal text-muted">{t('feedback.emailHint')}</span>
          <input type="email" name="contactEmail" autoComplete="email" maxLength={254} className="input max-w-full font-normal" {...field('contactEmail')} />
        </label>
        {errorText('contactEmail')}
        <label className="flex items-start gap-2">
          <input type="checkbox" name="consent" className="mt-1 size-5 shrink-0" {...field('consent')} />
          <span>{t('feedback.consent')}</span>
        </label>
        {errorText('consent')}
        {/* Ловушка для ботов: скрыта от людей и от экранных дикторов. */}
        <div aria-hidden="true" className="visually-hidden">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <div>
          <button type="submit" className="btn-primary" disabled={state.kind === 'sending'}>
            {state.kind === 'sending' ? t('feedback.sending') : t('feedback.send')}
          </button>
        </div>
      </form>
    </>
  );
}
