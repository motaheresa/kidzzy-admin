import { isPhone } from './is-phone';

describe('isPhone', () => {
  it.each(['01012345678', '010 1234-5678', '+20 (10) 1234-5678', '+201012345678', '123456'])(
    'accepts %j',
    (value) => {
      expect(isPhone(value)).toBe(true);
    },
  );

  it.each([
    ['too short', '12345'],
    ['too long', '1'.repeat(21)],
    ['letters', '010abc45678'],
    ['a plus in the middle', '010+12345678'],
    ['empty', ''],
    ['not a string', 1012345678],
  ])('refuses %s', (_label, value) => {
    expect(isPhone(value)).toBe(false);
  });
});
