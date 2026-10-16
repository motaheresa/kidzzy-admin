import type { PermissionAction } from '@kidzzy/shared';
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
export function RequirePermission({ permission }: { permission: PermissionAction }) {
  const { can } = usePermissions();
  return can(permission) ? <Outlet /> : <ForbiddenPage />;
}
