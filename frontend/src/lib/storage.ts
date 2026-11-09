/** localStorage может быть недоступен (приватный режим, запрет cookie): ошибки не ломают интерфейс. */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Настройка просто не сохранится между визитами.
  }
}
