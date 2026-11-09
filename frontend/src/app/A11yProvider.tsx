import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyPrefs, DEFAULT_PREFS, loadPrefs, resolvedTheme, savePrefs, systemPrefs, type A11yPrefs } from '../lib/a11y-prefs.ts';

interface A11yContextValue {
  prefs: A11yPrefs;
  update: (patch: Partial<A11yPrefs>) => void;
  reset: () => void;
  theme: 'light' | 'dark' | 'alt';
}

const A11yContext = createContext<A11yContextValue | null>(null);

export function A11yProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<A11yPrefs>(() => loadPrefs());
  const [system, setSystem] = useState(() => systemPrefs());

  // Следим за системными настройками темы и движения, если выбрано «Как в системе».
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const queries = [window.matchMedia('(prefers-color-scheme: dark)'), window.matchMedia('(prefers-reduced-motion: reduce)')];
    const onChange = () => setSystem(systemPrefs());
    queries.forEach((q) => q.addEventListener('change', onChange));
    return () => queries.forEach((q) => q.removeEventListener('change', onChange));
  }, []);

  useEffect(() => {
    applyPrefs(prefs, document.documentElement, system);
  }, [prefs, system]);

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

  const value = useMemo(() => ({ prefs, update, reset, theme: resolvedTheme(prefs, system) }), [prefs, update, reset, system]);
  return <A11yContext.Provider value={value}>{children}</A11yContext.Provider>;
}

export function useA11y(): A11yContextValue {
  const ctx = useContext(A11yContext);
  if (!ctx) throw new Error('useA11y вне A11yProvider');
  return ctx;
}
