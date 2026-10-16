import type { PermissionAction, PermissionScope } from '@kidzzy/shared';

/**
 * The scope the caller holds for `action`: 'any' when they hold `action:any` (it wins over own),
 * 'own' when they hold only `action:own`, null when they hold neither.
 */
export function scopeOf(
  permissions: readonly string[],
  action: PermissionAction,
): PermissionScope | null {
  if (permissions.includes(`${action}:any`)) return 'any';
  if (permissions.includes(`${action}:own`)) return 'own';
  return null;
}
