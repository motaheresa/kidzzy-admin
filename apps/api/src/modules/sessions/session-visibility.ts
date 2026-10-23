import type { SessionRow } from './session.repository';

/**
 * Scope `own` sees a session when they teach its group now OR they are the instructor on the
 * session (ADR-0006, amendment of 2026-10-22). Shared by sessions and attendance reads.
 */
export function isVisibleToInstructor(row: SessionRow, instructorId: string): boolean {
  return row.group.instructorId === instructorId || row.instructorId === instructorId;
}
