import { describe, expect, it } from 'vitest';
import { formatArchiveCode, parseArchiveCode } from '../src/archive-code.ts';
import { strictestAccess } from '../src/enums.ts';

describe('parseArchiveCode', () => {
  it.each([
    ['Ф. Р-123. Оп. 1. Д. 45', { fond: 'Р-123', inventory: '1', case: '45' }],
    ['ф р-123 оп 1 д 45', { fond: 'Р-123', inventory: '1', case: '45' }],
    ['Фонд № 12а, опись 3, дело 7', { fond: '12а', inventory: '3', case: '7' }],
    ['F. R-123. Inv. 1. File 45', { fond: 'R-123', inventory: '1', case: '45' }],
    ['Қ. 5. Тізб. 2. Іс 10', { fond: '5', inventory: '2', case: '10' }],
    ['Ф. П-5', { fond: 'П-5' }],
  ])('%s', (input, expected) => {
    expect(parseArchiveCode(input)).toMatchObject(expected);
  });

  it('разбирает листы', () => {
    expect(parseArchiveCode('Ф. 1. Оп. 2. Д. 3. Л. 1–12')?.sheets).toBe('1–12');
  });

  it('возвращает null без номера фонда', () => {
    expect(parseArchiveCode('маслозавод 1956')).toBeNull();
    expect(parseArchiveCode('')).toBeNull();
  });
});

describe('formatArchiveCode', () => {
  it('собирает шифр по-русски', () => {
    expect(formatArchiveCode({ fond: 'Р-123', inventory: '1', case: '45', sheets: '1–12' })).toBe('Ф. Р-123. Оп. 1. Д. 45. Л. 1–12.');
  });
  it('собирает неполный шифр', () => {
    expect(formatArchiveCode({ fond: '7' }, 'en')).toBe('F. 7.');
  });
  it('обратимо с разбором', () => {
    const code = { fond: 'Р-123', inventory: '1', case: '45' };
    expect(parseArchiveCode(formatArchiveCode(code))).toMatchObject(code);
  });
});

describe('strictestAccess', () => {
  it('берёт самый строгий уровень цепочки', () => {
    expect(strictestAccess(['open', 'open'])).toBe('open');
    expect(strictestAccess(['open', 'restricted', 'open'])).toBe('restricted');
    expect(strictestAccess(['restricted', 'closed'])).toBe('closed');
    expect(strictestAccess([])).toBe('open');
  });
});
