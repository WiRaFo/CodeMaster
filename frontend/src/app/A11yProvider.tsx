import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyPrefs, DEFAULT_PREFS, loadPrefs, savePrefs, type A11yPrefs } from '../lib/a11y-prefs.ts';

interface A11yContextValue {
  prefs: A11yPrefs;
  update: (patch: Partial<A11yPrefs>) => void;
  reset: () => void;
}

const A11yContext = createContext<A11yContextValue | null>(null);

export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPrefs>(() => loadPrefs());

  useEffect(() => {
    applyPrefs(prefs, document.documentElement);
  }, [prefs]);

  const update = useCallback((patch: Partial<A11yPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    savePrefs(DEFAULT_PREFS);
    setPrefs(DEFAULT_PREFS);
  }, []);

  const value = useMemo(() => ({ prefs, update, reset }), [prefs, update, reset]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11y(): A11yContextValue {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error('useA11y вне A11yProvider');
  return ctx;
}
