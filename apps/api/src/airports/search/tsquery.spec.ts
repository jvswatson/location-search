import { buildPrefixTsquery, tsqueryWords } from './tsquery.js';

describe('tsqueryWords', () => {
  it('lowercases and splits on anything outside [a-z0-9]', () => {
    expect(tsqueryWords("  O'Hare  Int'l-2 ")).toEqual(['o', 'hare', 'int', 'l', '2']);
  });

  it('folds accents rather than dropping the letter', () => {
    expect(tsqueryWords('Zürich São Paulo')).toEqual(['zurich', 'sao', 'paulo']);
  });

  it('neutralizes tsquery operators and syntax', () => {
    expect(tsqueryWords("heath:* & !lon | (x) <-> 'y'")).toEqual(['heath', 'lon', 'x', 'y']);
  });

  it('caps the number of terms', () => {
    expect(tsqueryWords('a b c d e f g h i j')).toHaveLength(8);
  });

  it('returns nothing for text without usable characters', () => {
    expect(tsqueryWords('!!! ***')).toEqual([]);
    expect(tsqueryWords('北京')).toEqual([]);
  });
});

describe('buildPrefixTsquery', () => {
  it('builds AND-ed prefix terms', () => {
    expect(buildPrefixTsquery('heath')).toBe('heath:*');
    expect(buildPrefixTsquery('New York')).toBe('new:* & york:*');
  });

  it('returns null when nothing is left after sanitizing', () => {
    expect(buildPrefixTsquery(' :*&| ')).toBeNull();
  });

  it('only ever emits [a-z0-9], ":*" and " & "', () => {
    const out = buildPrefixTsquery(`a'b"c\\d;--e)f(g!h`) ?? '';
    expect(out.replaceAll(':*', '').replaceAll(' & ', '')).toMatch(/^[a-z0-9]+$/);
  });
});
