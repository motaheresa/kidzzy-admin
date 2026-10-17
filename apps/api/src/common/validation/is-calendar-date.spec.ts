import { isCalendarDate } from './is-calendar-date';

describe('isCalendarDate', () => {
  it.each(['2026-10-17', '2028-02-29', '2026-12-31'])('accepts %j', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    ['a day that does not exist', '2026-02-30'],
    ['not a leap year', '2027-02-29'],
    ['month 13', '2026-13-01'],
    ['a date-time', '2026-10-17T00:00:00Z'],
    ['no zero padding', '2026-1-7'],
    ['empty', ''],
    ['not a string', 20261017],
  ])('refuses %s', (_label, value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});
