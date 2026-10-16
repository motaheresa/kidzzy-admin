import type { ClsService } from 'nestjs-cls';
import type { TenantStore } from '../tenancy/tenant-context';
import { AccessContext } from './access-context';

function accessFor(store: Partial<TenantStore> | null): AccessContext {
  const cls = {
    isActive: () => store !== null,
    get: (key: 'userId' | 'permissions'): unknown => store?.[key],
  } as unknown as ClsService<TenantStore>;
  return new AccessContext(cls);
}

const status = (fn: () => unknown) => {
  try {
    return fn();
  } catch (error) {
    return (error as { getStatus: () => number }).getStatus();
  }
};

describe('AccessContext', () => {
  it('scopeFor: any when the caller holds :any, even if they also hold :own', () => {
    const access = accessFor({ permissions: ['groups.read:own', 'groups.read:any'] });
    expect(access.scopeFor('groups.read')).toBe('any');
  });

  it('scopeFor: own when the caller holds only :own', () => {
    expect(accessFor({ permissions: ['groups.read:own'] }).scopeFor('groups.read')).toBe('own');
  });

  it('scopeFor: 403 when the caller holds neither', () => {
    expect(
      status(() => accessFor({ permissions: ['students.read:any'] }).scopeFor('groups.read')),
    ).toBe(403);
    expect(status(() => accessFor({}).scopeFor('groups.read'))).toBe(403);
  });

  it('can: true for either scope, false otherwise', () => {
    const access = accessFor({ permissions: ['sessions.update:own'] });
    expect(access.can('sessions.update')).toBe(true);
    expect(access.can('sessions.undo_held')).toBe(false);
  });

  it('ensureOwner: with scope own, only the caller’s own record passes; any passes all', () => {
    const access = accessFor({ userId: 'u1', permissions: ['groups.read:own'] });
    expect(status(() => access.ensureOwner('own', 'u1'))).toBeUndefined();
    expect(status(() => access.ensureOwner('own', 'u2'))).toBe(403);
    expect(status(() => access.ensureOwner('own', null))).toBe(403);
    expect(status(() => access.ensureOwner('any', 'u2'))).toBeUndefined();
  });

  it('userId: 401 outside a signed-in request', () => {
    expect(status(() => accessFor(null).userId)).toBe(401);
    expect(accessFor({ userId: 'u1' }).userId).toBe('u1');
  });
});
