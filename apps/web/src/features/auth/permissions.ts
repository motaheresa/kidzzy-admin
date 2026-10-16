import type { PermissionAction, PermissionScope } from '@kidzzy/shared';

/**
 * The scope the user holds for `action`: 'any' when they hold `action:any` (it wins over own),
 * 'own' when they hold only `action:own`, null when they hold neither. Same rule as the API's
 * PermissionsGuard; the UI only hides or shows things with it, the server enforces.
 */
export function scopeOf(
  permissions: readonly string[],
  action: PermissionAction,
): PermissionScope | null {
  if (permissions.includes(`${action}:any`)) return 'any';
  if (permissions.includes(`${action}:own`)) return 'own';
  return null;
}
