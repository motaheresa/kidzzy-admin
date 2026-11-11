import type { Session } from '@kidzzy/shared';
import type { SessionRow } from './session.repository';

/**
 * openapi.yaml: Session. Built field by field.
 * instructorId is the instructor on the session (who taught it, or who will), which can differ
 * from the group's current instructor. status_changed_* stay in the database and off this response.
 */
export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    group: { id: row.group.id, name: row.group.name },
    instructorId: row.instructorId,
    instructorName: row.instructor.name,
    scheduledAt: row.scheduledAt.toISOString(),
    durationMin: row.durationMin,
    status: row.status,
    sessionNumber: row.sessionNumber,
    isMakeup: row.isMakeup,
    compensatesSessionId: row.compensatesSessionId,
    cancelReason: row.cancelReason,
    topic: row.topic,
    actualStartedAt: row.actualStartedAt?.toISOString() ?? null,
    actualEndedAt: row.actualEndedAt?.toISOString() ?? null,
    actualDurationMin: actualDurationMin(row),
  };
}

/**
 * The minutes between the actual start and end, computed on read and never stored: the two
 * instants are the one source, so a correction cannot leave a stored duration that disagrees.
 */
export function actualDurationMin(row: {
  actualStartedAt: Date | null;
  actualEndedAt: Date | null;
}): number | null {
  if (!row.actualStartedAt || !row.actualEndedAt) return null;
  return Math.round((row.actualEndedAt.getTime() - row.actualStartedAt.getTime()) / 60_000);
}
