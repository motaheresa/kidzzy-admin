import { describe, expect, it } from 'vitest';
import { formatDate, formatMoney, formatNumber } from '.';

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;

describe('format', () => {
  it('prints Western digits in the Arabic locale', () => {
    for (const text of [
      formatNumber(1234567.5),
      formatMoney('1500.00'),
      formatDate('2026-10-16T12:00:00Z'),
    ]) {
      expect(text).toMatch(/[0-9]/);
      expect(text).not.toMatch(ARABIC_INDIC_DIGITS);
    }
  });

  it('keeps the amount of a money string', () => {
    expect(formatMoney('1500.00')).toMatch(/1,500\.00/);
  });
});
