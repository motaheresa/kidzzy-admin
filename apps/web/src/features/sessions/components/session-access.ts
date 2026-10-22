import type { PermissionAction, PermissionScope, Session } from '@kidzzy/shared';

/**
 * Whether this caller may change this session from the screen (mark Held, cancel).
 * Scope `own` requires the instructor on the session, the same write rule as the API.
 * The status and the time are each action's own rule. The API decides again.
 */
export function canWriteSession(
  session: Session,
  callerId: string | undefined,
  can: (action: PermissionAction) => boolean,
  scope: PermissionScope | null,
): boolean {
  if (!can('sessions.update') || !callerId) return false;
  return !(scope === 'own' && session.instructorId !== callerId);
}
