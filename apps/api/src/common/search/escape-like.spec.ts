import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it.each([
    ['plain text', 'plain text'],
    ['50%', '50\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
    ['أحمد', 'أحمد'],
  ])('%j -> %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});
