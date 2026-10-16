import { normalizeEmail, normalizePhone } from './login-identifiers';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Admin@Kidzzy.COM ')).toBe('admin@kidzzy.com');
  });

  it('keeps characters that are wildcards in SQL LIKE, so they only match themselves', () => {
    expect(normalizeEmail('%@%')).toBe('%@%');
  });
});

describe('normalizePhone', () => {
  it.each([
    ['01012345678', '01012345678'],
    ['010 1234-5678', '01012345678'],
    ['(010) 1234 5678', '01012345678'],
    ['  +20 (10) 1234-5678 ', '+201012345678'],
    ['010.1234.5678', '01012345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('keeps a + only at the start', () => {
    expect(normalizePhone('010+1234')).toBe('0101234');
  });
});
