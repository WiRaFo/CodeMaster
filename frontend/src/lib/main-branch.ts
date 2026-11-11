import { useEffect, useState } from 'react';
import { apiGet } from './api.ts';

/** Контакты основного архива (/branches/main): шапка и подвал берут их из API, а не из вёрстки. */
export interface MainBranch {
  name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  scheduleText: string | null;
  readingRoomSchedule: string | null;
  needsVerification: boolean;
}

export type MainBranchState = { status: 'loading' } | { status: 'ready'; branch: MainBranch } | { status: 'error' };

/** Шапка и подвал монтируются вместе: второй вызов получает тот же промис, пока первый запрос не завершился. */
const cache = new Map<string, Promise<MainBranch>>();

function loadMainBranch(lang: string): Promise<MainBranch> {
  let pending = cache.get(lang);
  if (!pending) {
    pending = apiGet<MainBranch>(`/branches/main?lang=${lang}`);
    cache.set(lang, pending);
    pending.finally(() => cache.delete(lang)).catch(() => undefined);
  }
  return pending;
}

export function useMainBranch(lang: string): MainBranchState {
  const [state, setState] = useState<MainBranchState>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    loadMainBranch(lang)
      .then((branch) => { if (active) setState({ status: 'ready', branch }); })
      .catch((error: unknown) => {
        if (!active) return;
        console.warn('contacts are unavailable', error);
        setState({ status: 'error' });
      });
    return () => { active = false; };
  }, [lang]);
  return state;
}

/** Ссылка tel: из номера в любом написании. */
export const telHref = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`;
