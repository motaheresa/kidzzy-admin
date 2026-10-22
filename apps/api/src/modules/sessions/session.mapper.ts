import type { Session } from '@kidzzy/shared';
import type { SessionRow } from './session.repository';

/**
 * openapi.yaml: Session. Built field by field.
 * instructorId is the instructor on the session (who taught it, or who will), which can differ
 * from the group's current instructor.
 */
export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    group: { id: row.group.id, name: row.group.name },
    instructorId: row.instructorId,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMin: row.durationMin,
    status: row.status,
    sessionNumber: row.sessionNumber,
    isMakeup: row.isMakeup,
    compensatesSessionId: row.compensatesSessionId,
    cancelReason: row.cancelReason,
  };
}
