import type { PermissionAction, PermissionScope } from '@kidzzy/shared';
import { useMemo } from 'react';
import { scopeOf } from '../permissions';
import { useSession } from './useSession';

/**
 * What the signed-in user may do, from the session's Me.permissions (the same keys the access
 * token carries). For hiding and showing UI only: the API enforces every permission itself.
 *
 *   const { can, scopeFor } = usePermissions();
 *   {can('groups.create') && <Button>إضافة جروب</Button>}
 */
export function usePermissions(): {
  can: (action: PermissionAction) => boolean;
  scopeFor: (action: PermissionAction) => PermissionScope | null;
} {
  const { data: me } = useSession();
  const permissions = me?.permissions;

  return useMemo(() => {
    const keys = permissions ?? [];
    return {
      can: (action) => scopeOf(keys, action) !== null,
      scopeFor: (action) => scopeOf(keys, action),
    };
  }, [permissions]);
}
