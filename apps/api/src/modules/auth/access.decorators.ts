import { SetMetadata } from '@nestjs/common';
import type { PermissionAction } from '@kidzzy/shared';

// Every route declares EXACTLY ONE access rule (fail closed, CLAUDE.md "Authorization"):
//   @Public()                      anyone, no login (login, refresh, health)
//   @SignedIn()                    any signed-in user (/auth/me, /auth/logout)
//   @RequirePermission('x.y')      a signed-in user holding x.y:any or x.y:own
// PermissionsGuard refuses a route that declares none or several, and
// test/route-declarations.e2e-spec.ts fails CI before such a route ships.

export const IS_PUBLIC_KEY = 'isPublic';
export const SIGNED_IN_KEY = 'access:signedIn';
export const PERMISSION_KEY = 'access:permission';

/** Anyone may call this route, without a login. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Any signed-in user may call this route, whatever their permissions. */
export const SignedIn = () => SetMetadata(SIGNED_IN_KEY, true);

/**
 * The caller needs `action` with either scope (`:any` or `:own`), e.g. 'groups.read' as in
 * x-permission of openapi.yaml. The service then asks AccessContext.scopeFor(action) which one.
 */
export const RequirePermission = (action: PermissionAction) => SetMetadata(PERMISSION_KEY, action);

export const ALLOWED_DURING_PASSWORD_CHANGE_KEY = 'access:allowedDuringPasswordChange';

/**
 * A signed-in route that still works while the user must replace a temporary password (US-02):
 * only /auth/me, /auth/logout and /auth/change-password. Every other non-public route answers
 * 403 PASSWORD_CHANGE_REQUIRED until the password is changed. It is not an access rule: the
 * route still declares exactly one of the three above. test/route-declarations.e2e-spec.ts pins
 * the list, so adding it to another route fails CI by name.
 */
export const AllowedDuringPasswordChange = () =>
  SetMetadata(ALLOWED_DURING_PASSWORD_CHANGE_KEY, true);

/** True when the handler is marked @AllowedDuringPasswordChange() (never the class). */
export function isAllowedDuringPasswordChange(handler: DecoratedTarget): boolean {
  return Reflect.getMetadata(ALLOWED_DURING_PASSWORD_CHANGE_KEY, handler) === true;
}

export type AccessDeclaration =
  { kind: 'public' } | { kind: 'signedIn' } | { kind: 'permission'; action: PermissionAction };

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type DecoratedTarget = Function;

function declarationsOn(target: DecoratedTarget): AccessDeclaration[] {
  const found: AccessDeclaration[] = [];
  if (Reflect.getMetadata(IS_PUBLIC_KEY, target) === true) found.push({ kind: 'public' });
  if (Reflect.getMetadata(SIGNED_IN_KEY, target) === true) found.push({ kind: 'signedIn' });
  const action = Reflect.getMetadata(PERMISSION_KEY, target) as PermissionAction | undefined;
  if (action) found.push({ kind: 'permission', action });
  return found;
}

/**
 * The access rules a route declares: on the handler, or, when the handler declares none, on its
 * controller class. A valid route has exactly one.
 */
export function accessDeclarationsOf(
  handler: DecoratedTarget,
  controller: DecoratedTarget,
): AccessDeclaration[] {
  const onHandler = declarationsOn(handler);
  return onHandler.length > 0 ? onHandler : declarationsOn(controller);
}
