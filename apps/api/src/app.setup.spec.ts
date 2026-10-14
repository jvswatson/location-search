import { parseTrustProxy } from './app.setup.js';

describe('parseTrustProxy', () => {
  it.each([
    ['true', true],
    ['false', false],
    ['1', 1],
    [' 2 ', 2],
    ['loopback, uniquelocal', 'loopback, uniquelocal'],
    ['10.0.0.0/8', '10.0.0.0/8'],
  ])('%j → %j', (input, expected) => {
    expect(parseTrustProxy(input)).toEqual(expected);
  });
});
