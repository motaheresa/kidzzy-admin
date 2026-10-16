import { isAccessTokenPayload } from './auth.config';

describe('isAccessTokenPayload', () => {
  const valid = {
    sub: 'u1',
    aid: 'a1',
    sid: 's1',
    perms: ['groups.read:own'],
    mustChangePassword: false,
  };

  it('accepts the shape the app issues, with either value of mustChangePassword', () => {
    expect(isAccessTokenPayload(valid)).toBe(true);
    expect(isAccessTokenPayload({ ...valid, mustChangePassword: true })).toBe(true);
  });

  it.each([
    ['no mustChangePassword', { ...valid, mustChangePassword: undefined }],
    ['mustChangePassword as a string', { ...valid, mustChangePassword: 'false' }],
    ['no perms', { ...valid, perms: undefined }],
    ['a perms entry that is not a string', { ...valid, perms: [1] }],
    ['no sid', { ...valid, sid: undefined }],
    ['null', null],
  ])('refuses %s', (_label, payload) => {
    expect(isAccessTokenPayload(payload)).toBe(false);
  });
});
