import { describe, expect, it } from 'vitest';
import { scopeOf } from './permissions';

describe('scopeOf', () => {
  it('is any when the user holds :any, even with :own too', () => {
    expect(scopeOf(['groups.read:own', 'groups.read:any'], 'groups.read')).toBe('any');
  });

  it('is own when the user holds only :own', () => {
    expect(scopeOf(['groups.read:own'], 'groups.read')).toBe('own');
  });

  it('is null when the user holds neither, or nothing at all', () => {
    expect(scopeOf(['students.read:any'], 'groups.read')).toBeNull();
    expect(scopeOf([], 'groups.read')).toBeNull();
  });

  it('does not match a longer action that starts the same', () => {
    expect(scopeOf(['sessions.update:any'], 'sessions.undo_held')).toBeNull();
  });
});
