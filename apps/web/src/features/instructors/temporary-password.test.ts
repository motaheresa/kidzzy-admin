import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, TEMPORARY_PASSWORD_LENGTH } from './temporary-password';

describe('generateTemporaryPassword', () => {
  it('is long enough for the API (8+) and uses only unambiguous letters and digits', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
    }
  });

  it('is different every time', () => {
    const passwords = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(passwords.size).toBe(100);
  });
});
