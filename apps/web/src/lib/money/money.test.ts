import { describe, expect, it } from 'vitest';
import { toAmount } from '.';

describe('toAmount', () => {
  it.each([
    ['1500', '1500.00'],
    ['1500.5', '1500.50'],
    ['1500.', '1500.00'],
    ['1,500.25', '1500.25'],
    [' 0750 ', '750.00'],
    ['١٥٠٠', '1500.00'],
    ['١٥٠٠٫٥', '1500.50'],
    ['0.5', '0.50'],
  ])('turns %p into %p', (input, amount) => {
    expect(toAmount(input)).toBe(amount);
  });

  it.each(['abc', '-5', '15.555', ''])('leaves %p for the API to refuse', (input) => {
    expect(toAmount(input)).toBe(input);
  });
});
