import { isHttpUrl } from './http-url';

describe('isHttpUrl', () => {
  it.each([
    'https://drive.google.com/drive/folders/1AbC-_x?usp=sharing#top',
    'http://example.com',
    'HTTPS://EXAMPLE.COM/Course',
    'http://localhost:3000/a',
    'https://example.com/المواد',
  ])('accepts %s', (url) => {
    expect(isHttpUrl(url, 2048)).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript://%0Aalert(1)',
    'data:text/html,<b>x</b>',
    'ftp://example.com/file',
    'mailto:someone@example.com',
    'example.com',
    '/material-links',
    '//example.com',
    'http:example.com',
    'http:///path',
    'https://',
    'https://exa mple.com',
    'https://example.com/a\nb',
    ' https://example.com',
    'https://[not-an-address',
    '',
  ])('refuses %j', (url) => {
    expect(isHttpUrl(url, 2048)).toBe(false);
  });

  it('refuses a value that is not a string', () => {
    expect(isHttpUrl(undefined, 2048)).toBe(false);
    expect(isHttpUrl(null, 2048)).toBe(false);
    expect(isHttpUrl(['https://example.com'], 2048)).toBe(false);
  });

  it('accepts exactly the limit and refuses one character more', () => {
    const base = 'https://example.com/';
    const atLimit = base + 'a'.repeat(2048 - base.length);
    expect(isHttpUrl(atLimit, 2048)).toBe(true);
    expect(isHttpUrl(`${atLimit}a`, 2048)).toBe(false);
  });
});
