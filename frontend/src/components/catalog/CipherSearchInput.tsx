import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { cipherBackspace, cipherGhost, cipherSpace, normalizeCipherStart } from '../../lib/cipher-input.ts';

/**
 * Поле поиска с подсказкой шифра (см. lib/cipher-input.ts). Это обычное текстовое поле: серая подсказка
 * за текстом скрыта от экранных дикторов, а шифр можно ввести и полностью вручную.
 * Подсказка прячется, когда текст не помещается в поле, чтобы не расходиться с прокруткой.
 */
export function CipherSearchInput({ value, onValue, className = '', ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onValue: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [fits, setFits] = useState(true);
  const hint = cipherGhost(value);
  const ghost = /\s$/u.test(value) ? hint.trimStart() : hint;

  useLayoutEffect(() => {
    const el = input.current;
    setFits(!el || el.scrollWidth <= el.clientWidth);
  }, [value]);

  const atEnd = (el: HTMLInputElement) => el.selectionStart === el.value.length && el.selectionEnd === el.value.length;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const el = event.currentTarget;
    if (event.altKey || event.ctrlKey || event.metaKey || !atEnd(el)) return;
    const next = event.key === ' ' ? cipherSpace(el.value) : event.key === 'Backspace' ? cipherBackspace(el.value) : null;
    if (next === null) return;
    event.preventDefault();
    onValue(next);
  };

  // На экранных клавиатурах телефонов пробел часто не приходит как событие клавиши, поэтому он же разбирается здесь.
  const onType = (next: string) => {
    if (next === `${value} `) return cipherSpace(value) ?? next;
    return normalizeCipherStart(next);
  };

  return (
    <span className="cipher-wrap">
      <input ref={input} {...rest} type="search" value={value} className={className} autoComplete="off" spellCheck={false}
        onChange={(e) => onValue(onType(e.target.value))} onKeyDown={onKeyDown} />
      {ghost && fits ? (
        <span className={`${className} cipher-ghost`} aria-hidden="true">
          <span className="cipher-typed">{value}</span>{ghost}
        </span>
      ) : null}
    </span>
  );
}
