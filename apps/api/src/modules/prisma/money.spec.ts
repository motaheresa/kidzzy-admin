import { subtractMoney, sumMoney, toDecimal, toMoney } from './money';

describe('money', () => {
  it('sums decimal strings without the floating point error of numbers', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(sumMoney(['1500.00', '900.50', '1250.25'])).toBe('3650.75');
  });

  it('is zero with two places for no amounts', () => {
    expect(sumMoney([])).toBe('0.00');
  });

  it('subtracts, and can go negative', () => {
    expect(subtractMoney('900.00', '1500.00')).toBe('-600.00');
    expect(subtractMoney('1500.00', '900.00')).toBe('600.00');
  });

  it('keeps toMoney and toDecimal round trips at two places', () => {
    expect(toMoney(toDecimal('1500'))).toBe('1500.00');
  });
});
