import type { ExecutionContext } from '@nestjs/common';
import {
  AllowedDuringEvaluation,
  AllowedDuringPasswordChange,
  Public,
  RequirePermission,
  SignedIn,
} from './access.decorators';
import { PermissionsGuard } from './permissions.guard';

// Decorated handlers to run the guard against, as Nest would.
class Routes {
  @Public() open() {}
  @SignedIn() signedIn() {}
  @RequirePermission('groups.read') readGroups() {}
  undeclared() {}
  @Public() @SignedIn() twice() {}
  @SignedIn() @AllowedDuringPasswordChange() @AllowedDuringEvaluation() changePassword() {}
  @RequirePermission('evaluations.write') @AllowedDuringEvaluation() submitEvaluation() {}
}

@RequirePermission('payments.read')
class ClassLevel {
  inherited() {}
  @Public() overridden() {}
}

function contextFor(
  controller: new () => object,
  method: string,
  auth?: { permissions: string[]; mustChangePassword?: boolean; pendingEvaluation?: boolean },
): ExecutionContext {
  const handler = (controller.prototype as Record<string, () => void>)[method];
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => (auth ? { auth } : {}) }),
  } as unknown as ExecutionContext;
}

const status = (fn: () => unknown) => {
  try {
    fn();
    return 'allowed';
  } catch (error) {
    return (error as { getStatus?: () => number }).getStatus?.() ?? 'threw';
  }
};

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return 'allowed';
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard();
  const signedIn = (permissions: string[] = []) => ({
    permissions,
    mustChangePassword: false,
    pendingEvaluation: false,
  });

  describe('while the password must be changed (US-02)', () => {
    const mustChange = (permissions: string[] = []) => ({ permissions, mustChangePassword: true });

    it.each([
      ['a permission route the user holds', 'readGroups', ['groups.read:any']],
      ['a signed-in route', 'signedIn', []],
    ])('refuses %s with PASSWORD_CHANGE_REQUIRED (403)', (_label, method, permissions) => {
      const run = () => guard.canActivate(contextFor(Routes, method, mustChange(permissions)));
      expect(status(run)).toBe(403);
      expect(codeOf(run)).toBe('PASSWORD_CHANGE_REQUIRED');
    });

    it('lets an @AllowedDuringPasswordChange() route and a public route through', () => {
      expect(
        status(() => guard.canActivate(contextFor(Routes, 'changePassword', mustChange()))),
      ).toBe('allowed');
      expect(status(() => guard.canActivate(contextFor(Routes, 'open', mustChange())))).toBe(
        'allowed',
      );
    });

    it('says PASSWORD_CHANGE_REQUIRED before FORBIDDEN, so the client knows what to do', () => {
      expect(codeOf(() => guard.canActivate(contextFor(Routes, 'readGroups', mustChange())))).toBe(
        'PASSWORD_CHANGE_REQUIRED',
      );
    });
  });

  describe('while an evaluation must be written (US-42)', () => {
    const pending = (permissions: string[] = []) => ({
      permissions,
      mustChangePassword: false,
      pendingEvaluation: true,
    });

    it.each([
      ['a permission route the user holds', 'readGroups', ['groups.read:any']],
      ['a signed-in route', 'signedIn', []],
    ])('refuses %s with EVALUATION_REQUIRED (403)', (_label, method, permissions) => {
      const run = () => guard.canActivate(contextFor(Routes, method, pending(permissions)));
      expect(status(run)).toBe(403);
      expect(codeOf(run)).toBe('EVALUATION_REQUIRED');
    });

    it('lets an @AllowedDuringEvaluation() route and a public route through', () => {
      const writer = pending(['evaluations.write:own']);
      expect(status(() => guard.canActivate(contextFor(Routes, 'submitEvaluation', writer)))).toBe(
        'allowed',
      );
      expect(status(() => guard.canActivate(contextFor(Routes, 'changePassword', writer)))).toBe(
        'allowed',
      );
      expect(status(() => guard.canActivate(contextFor(Routes, 'open', pending())))).toBe(
        'allowed',
      );
    });

    it('still checks the permission of an allowed route', () => {
      expect(
        codeOf(() => guard.canActivate(contextFor(Routes, 'submitEvaluation', pending([])))),
      ).toBe('FORBIDDEN');
    });

    it('says EVALUATION_REQUIRED before FORBIDDEN, so the client knows what to do', () => {
      expect(codeOf(() => guard.canActivate(contextFor(Routes, 'readGroups', pending())))).toBe(
        'EVALUATION_REQUIRED',
      );
    });

    it('lets the password gate win: a temporary password is changed first', () => {
      const both = {
        permissions: ['groups.read:any'],
        mustChangePassword: true,
        pendingEvaluation: true,
      };
      expect(codeOf(() => guard.canActivate(contextFor(Routes, 'readGroups', both)))).toBe(
        'PASSWORD_CHANGE_REQUIRED',
      );
      // An evaluation route is not a password-change route: the password still comes first.
      expect(
        codeOf(() =>
          guard.canActivate(
            contextFor(Routes, 'submitEvaluation', {
              ...both,
              permissions: ['evaluations.write:own'],
            }),
          ),
        ),
      ).toBe('PASSWORD_CHANGE_REQUIRED');
    });
  });

  it('lets anyone through a @Public() route, even without a login', () => {
    expect(status(() => guard.canActivate(contextFor(Routes, 'open')))).toBe('allowed');
  });

  it('lets any signed-in user through a @SignedIn() route, and refuses without a login', () => {
    expect(status(() => guard.canActivate(contextFor(Routes, 'signedIn', signedIn())))).toBe(
      'allowed',
    );
    expect(status(() => guard.canActivate(contextFor(Routes, 'signedIn')))).toBe(401);
  });

  it.each([
    [['groups.read:any'], 'allowed'],
    [['groups.read:own'], 'allowed'],
    [['groups.update:any', 'students.read:own'], 403],
    [[], 403],
  ])('@RequirePermission("groups.read") with %j -> %s', (permissions, expected) => {
    expect(
      status(() => guard.canActivate(contextFor(Routes, 'readGroups', signedIn(permissions)))),
    ).toBe(expected);
  });

  it('fails closed: a route with no declaration is refused (403), even for an admin', () => {
    const admin = signedIn(['groups.read:any', 'payments.manage:any']);
    expect(status(() => guard.canActivate(contextFor(Routes, 'undeclared', admin)))).toBe(403);
  });

  it('fails closed: a route with two declarations is refused (403)', () => {
    expect(status(() => guard.canActivate(contextFor(Routes, 'twice', signedIn())))).toBe(403);
  });

  it('uses the controller-level declaration when the handler has none', () => {
    expect(
      status(() =>
        guard.canActivate(contextFor(ClassLevel, 'inherited', signedIn(['payments.read:own']))),
      ),
    ).toBe('allowed');
    expect(status(() => guard.canActivate(contextFor(ClassLevel, 'inherited', signedIn())))).toBe(
      403,
    );
    expect(status(() => guard.canActivate(contextFor(ClassLevel, 'overridden')))).toBe('allowed');
  });
});
