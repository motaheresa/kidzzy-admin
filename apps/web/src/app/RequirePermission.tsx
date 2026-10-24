import type { PermissionAction, PermissionScope } from '@kidzzy/shared';
import { Outlet } from 'react-router';
import { usePermissions } from '@/features/auth';
import { ForbiddenPage } from '@/pages/ForbiddenPage';

/**
 * A route wrapper, used as a child of ProtectedLayout (the session is loaded there):
 *
 *   { element: <RequirePermission permission="groups.read" />, children: [{ path: '/groups', … }] }
 *
 * The user sees the screens when they hold the permission with either scope, and the forbidden
 * page otherwise. It only hides screens: the API enforces every permission, and a 403 from it
 * still goes through the error layer (the FORBIDDEN message).
 */
export function RequirePermission({
  permission,
  scope,
}: {
  permission: PermissionAction;
  /** Only this scope may open it (for example "any": the admin's screen, not an instructor's own view). */
  scope?: PermissionScope;
}) {
  const { can, scopeFor } = usePermissions();
  const allowed = scope ? scopeFor(permission) === scope : can(permission);
  return allowed ? <Outlet /> : <ForbiddenPage />;
}
