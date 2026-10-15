import { TenantViolationError } from '../tenancy/tenancy.errors';
import { scopeQueryArgs, TENANT_MODELS } from './tenant-scope';

const A = 'academy-a';

describe('TENANT_MODELS', () => {
  it('holds every model with academyId, and only those', () => {
    expect([...TENANT_MODELS].sort()).toEqual(['RefreshToken', 'Role', 'User']);
  });
});

describe('scopeQueryArgs', () => {
  it.each(['findMany', 'findFirst', 'findUnique', 'count', 'updateMany', 'delete', 'deleteMany'])(
    'adds academyId to the where of %s',
    (operation) => {
      const args = scopeQueryArgs('User', operation, { where: { id: 'u1' } }, A);
      expect(args.where).toEqual({ id: 'u1', academyId: A });
    },
  );

  it('scopes a query that had no where at all', () => {
    expect(scopeQueryArgs('User', 'findMany', {}, A).where).toEqual({ academyId: A });
  });

  it('replaces an academyId the caller put in where', () => {
    const args = scopeQueryArgs('User', 'findMany', { where: { academyId: 'other' } }, A);
    expect(args.where).toEqual({ academyId: A });
  });

  it('adds academyId to created rows', () => {
    expect(scopeQueryArgs('User', 'create', { data: { name: 'x' } }, A).data).toEqual({
      name: 'x',
      academyId: A,
    });
    expect(
      scopeQueryArgs('Role', 'createMany', { data: [{ name: 'a' }, { name: 'b' }] }, A).data,
    ).toEqual([
      { name: 'a', academyId: A },
      { name: 'b', academyId: A },
    ]);
  });

  it('scopes both sides of an upsert', () => {
    const args = scopeQueryArgs(
      'Role',
      'upsert',
      { where: { id: 'r1' }, create: { name: 'x' }, update: { name: 'y' } },
      A,
    );
    expect(args.where).toEqual({ id: 'r1', academyId: A });
    expect(args.create).toEqual({ name: 'x', academyId: A });
  });

  it('refuses to create a row in another academy', () => {
    expect(() => scopeQueryArgs('User', 'create', { data: { academyId: 'other' } }, A)).toThrow(
      TenantViolationError,
    );
  });

  it('refuses to move a row to another academy', () => {
    expect(() =>
      scopeQueryArgs('User', 'update', { where: { id: 'u1' }, data: { academyId: 'other' } }, A),
    ).toThrow(TenantViolationError);
  });

  it('refuses an operation it does not know, instead of running it unscoped', () => {
    expect(() => scopeQueryArgs('User', 'somethingNew', {}, A)).toThrow(/does not support/);
  });
});
