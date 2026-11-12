import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/** Единая вежливая live-область для сообщений экранному диктору (смена страницы, сброс настроек). */
const AnnouncerContext = createContext<(message: string) => void>(() => undefined);

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const announce = useCallback((text: string) => {
    // Сначала очищаем, чтобы повтор того же текста тоже был объявлен.
    setMessage('');
    window.setTimeout(() => setMessage(text), 50);
  }, []);
  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-testid="announcer">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export const useAnnounce = () => useContext(AnnouncerContext);
