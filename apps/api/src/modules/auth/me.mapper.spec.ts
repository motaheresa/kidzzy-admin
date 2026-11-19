import type { UserWithAccess } from '../users/user.repository';
import { toMe } from './me.mapper';

const role = (name: string, keys: string[]) => ({
  role: { name, permissions: keys.map((key) => ({ permission: { key } })) },
});

const user: UserWithAccess = {
  id: 'u1',
  name: 'Mona',
  email: 'mona@test.local',
  phone: null,
  mustChangePassword: false,
  academy: { id: 'a1', name: 'KidzzyCoders', timezone: 'Africa/Cairo' },
  roles: [
    role('Instructor', ['sessions.read:own', 'materials.read:any']),
    role('Admin', ['materials.read:any']),
  ],
};

describe('toMe', () => {
  it('sorts roles and permissions, and lists a permission granted twice once', () => {
    const me = toMe(user, 0);
    expect(me.roles).toEqual(['Admin', 'Instructor']);
    expect(me.permissions).toEqual(['materials.read:any', 'sessions.read:own']);
  });

  it('returns exactly the Me fields, nothing else from the row', () => {
    const row = {
      ...user,
      passwordHash: 'secret',
      academy: { ...user.academy, createdAt: new Date() },
    };
    const me = toMe(row, 0); // extra columns on the row must not reach the response
    expect(Object.keys(me).sort()).toEqual(
      [
        'academy',
        'email',
        'id',
        'mustChangePassword',
        'name',
        'pendingEvaluations',
        'permissions',
        'phone',
        'roles',
      ].sort(),
    );
    expect(Object.keys(me.academy).sort()).toEqual(['id', 'name', 'timezone']);
  });

  it('carries the count of blocking evaluations as it is given', () => {
    expect(toMe(user, 0).pendingEvaluations).toBe(0);
    expect(toMe(user, 2).pendingEvaluations).toBe(2);
  });
});
