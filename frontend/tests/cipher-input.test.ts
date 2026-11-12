import { describe, expect, it } from 'vitest';
import { parseArchiveCode } from '@archive-vko/shared';
import { cipherBackspace, cipherGhost, cipherSpace, cipherState, cleanCipher, normalizeCipherStart } from '../src/lib/cipher-input.ts';

describe('подсказка шифра в поле поиска', () => {
  it('режим шифра включается только с буквы фонда и номера', () => {
    expect(cipherState('Ф. 1')).not.toBeNull();
    expect(cipherState('ф1')).not.toBeNull();
    expect(cipherState('Қ. Р-5')).not.toBeNull();
    expect(cipherState('F 12')).not.toBeNull();
    expect(cipherState('фото 1960')).toBeNull();
    expect(cipherState('Ф.')).toBeNull();
    expect(cipherState('протокол')).toBeNull();
    expect(cipherState('fond records')).toBeNull();
  });

  it('начало приводится к «Ф. 1» на языке введённой буквы', () => {
    expect(normalizeCipherStart('ф1')).toBe('Ф. 1');
    expect(normalizeCipherStart('ф.12')).toBe('Ф. 12');
    expect(normalizeCipherStart('қ 3')).toBe('Қ. 3');
    expect(normalizeCipherStart('f.7')).toBe('F. 7');
    expect(normalizeCipherStart('фото')).toBe('фото');
  });

  it('пробел после номера подставляет следующую часть; без номера — ничего', () => {
    expect(cipherSpace('Ф. 1')).toBe('Ф. 1. Оп. ');
    expect(cipherSpace('Ф. 1. Оп. ')).toBe('Ф. 1. Оп. ');
    expect(cipherSpace('Ф. 1. Оп. 2')).toBe('Ф. 1. Оп. 2. Д. ');
    expect(cipherSpace('Ф. 1. Оп. 2. Д. 3')).toBe('Ф. 1. Оп. 2. Д. 3. Л. ');
    expect(cipherSpace('Ф. 1. Оп. 2. Д. 3. Л. 1-12')).toBeNull();
    expect(cipherSpace('Қ. 1')).toBe('Қ. 1. Тізб. ');
    expect(cipherSpace('Қ. 1. Тізб. 2')).toBe('Қ. 1. Тізб. 2. Іс ');
    expect(cipherSpace('F. 1. Inv. 2. File 3')).toBe('F. 1. Inv. 2. File 3. Fol. ');
    expect(cipherSpace('протокол')).toBeNull();
  });

  it('серая подсказка показывает оставшиеся части', () => {
    expect(cipherGhost('Ф. 1')).toBe(' Оп. Д. Л.');
    expect(cipherGhost('Ф. 1. Оп. 2')).toBe(' Д. Л.');
    expect(cipherGhost('Ф. 1. Оп. 2. Д. 3. Л. 5')).toBe('');
    expect(cipherGhost('Қ. 1')).toBe(' Тізб. Іс П.');
    expect(cipherGhost('протокол')).toBe('');
  });

  it('Backspace после подставленной подписи убирает её целиком', () => {
    expect(cipherBackspace('Ф. 1. Оп. ')).toBe('Ф. 1');
    expect(cipherBackspace('Ф. 1. Оп. 2. Д. ')).toBe('Ф. 1. Оп. 2');
    expect(cipherBackspace('Ф. 1. Оп. 2')).toBeNull();
    expect(cipherBackspace('Ф. 1')).toBeNull();
  });

  it('при отправке пустая последняя часть отбрасывается, шифр разбирается сервером', () => {
    expect(cleanCipher('Ф. 1. Оп. 2. Д. ')).toBe('Ф. 1. Оп. 2');
    expect(cleanCipher('  протокол заседания ')).toBe('протокол заседания');
    expect(parseArchiveCode(cleanCipher('Ф. 12. Оп. 3. Д. 45. Л. ')))
      .toEqual({ fond: '12', inventory: '3', case: '45', sheets: undefined });
    expect(parseArchiveCode('Қ. 12. Тізб. 3. Іс 45')).toMatchObject({ fond: '12', inventory: '3', case: '45' });
  });
});
