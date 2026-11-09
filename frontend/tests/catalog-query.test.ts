import { describe, expect, it } from 'vitest';
import { activeFilterCount, clearFilters, filterParams, parseCatalogQuery, toSearchString, toggleValue } from '../src/lib/catalog-query.ts';

const parse = (s: string) => parseCatalogQuery(new URLSearchParams(s));

describe('состояние каталога в адресе (F-036)', () => {
  it('разбирает повторяющиеся и перечисленные через запятую фильтры', () => {
    const q = parse('q=протокол&type=photo&type=organization_record&settlement=ridder,ust-kamenogorsk&hasDigitalCopy=true&yearFrom=1950&yearTo=1960&page=2');
    expect(q.q).toBe('протокол');
    expect(q.multi.type).toEqual(['photo', 'organization_record']);
    expect(q.multi.settlement).toEqual(['ridder', 'ust-kamenogorsk']);
    expect(q).toMatchObject({ hasDigitalCopy: true, yearFrom: 1950, yearTo: 1960, page: 2, sort: 'relevance' });
    expect(activeFilterCount(q)).toBe(7);
  });

  it('отбрасывает испорченные значения, чтобы API не отвечал ошибкой', () => {
    const q = parse('access=closed&access=open&yearFrom=19&yearTo=abcd&page=-3&sort=drop_table&type=' + 'x'.repeat(150));
    expect(q.multi.access).toEqual(['open']);
    expect(q.yearFrom).toBeNull();
    expect(q.yearTo).toBeNull();
    expect(q.page).toBe(1);
    expect(q.sort).toBe('code');
    expect(q.multi.type).toEqual([]);
  });

  it('меняет местами перепутанные годы и убирает дубликаты', () => {
    const q = parse('yearFrom=1990&yearTo=1950&topic=industry&topic=industry');
    expect([q.yearFrom, q.yearTo]).toEqual([1950, 1990]);
    expect(q.multi.topic).toEqual(['industry']);
  });

  it('адрес → состояние → адрес не меняется; умолчания не пишутся', () => {
    const s = '?q=%D0%BC%D0%B0%D1%81%D0%BB%D0%BE&branch=main&type=photo&hasDigitalCopy=true&yearFrom=1950&sort=date_desc&page=3';
    expect(toSearchString(parseCatalogQuery(new URLSearchParams(s)))).toBe(s);
    expect(toSearchString(parse('sort=code'))).toBe('');
    expect(toSearchString(parse('q=a&sort=relevance&page=1'))).toBe('?q=a');
  });

  it('переключение значения сбрасывает страницу, очистка оставляет запрос и сортировку', () => {
    const q = parse('q=a&type=photo&page=4&sort=date_asc');
    const off = toggleValue(q, 'type', 'photo');
    expect(off.multi.type).toEqual([]);
    expect(off.page).toBe(1);
    const on = toggleValue(off, 'period', '1946-1991');
    expect(on.multi.period).toEqual(['1946-1991']);
    const cleared = clearFilters(on);
    expect(activeFilterCount(cleared)).toBe(0);
    expect(cleared).toMatchObject({ q: 'a', sort: 'date_asc', page: 1 });
    expect(filterParams(cleared).toString()).toBe('q=a');
  });
});
