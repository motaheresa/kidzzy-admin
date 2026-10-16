import { describe, expect, it } from 'vitest';
import { loginPathFor, safeReturnTo } from './return-to';

const origin = 'https://app.kidzzy-coders.com';

describe('safeReturnTo', () => {
  it.each([
    ['/', '/'],
    ['/groups', '/groups'],
    ['/groups/1?tab=sessions', '/groups/1?tab=sessions'],
    ['/students?search=%D8%A3#top', '/students?search=%D8%A3#top'],
  ])('accepts the path %s on this site', (raw, expected) => {
    expect(safeReturnTo(raw, origin)).toBe(expected);
  });

  it.each([
    ['missing', null],
    ['undefined', undefined],
    ['empty', ''],
    ['protocol-relative', '//evil.com'],
    ['backslash host', '/\\evil.com'],
    ['backslash later', '/a\\..\\evil'],
    ['absolute URL', 'https://evil.com/'],
    ['javascript URL', 'javascript:alert(1)'],
    ['relative path', 'groups'],
    ['tab trick', '/\t/evil.com'],
    ['newline trick', '/\n/evil.com'],
    ['space', '/ /evil.com'],
    ['the login page', '/login'],
    ['the login page with a query', '/login?returnTo=%2Fgroups'],
  ])('falls back to "/" for %s', (_label, raw) => {
    expect(safeReturnTo(raw, origin)).toBe('/');
  });
});

describe('loginPathFor', () => {
  it('keeps the current path and query, encoded', () => {
    const path = loginPathFor({ pathname: '/groups/1', search: '?tab=sessions' });
    expect(path).toBe('/login?returnTo=%2Fgroups%2F1%3Ftab%3Dsessions');
    const returnTo = new URL(path, origin).searchParams.get('returnTo');
    expect(safeReturnTo(returnTo, origin)).toBe('/groups/1?tab=sessions');
  });
});
