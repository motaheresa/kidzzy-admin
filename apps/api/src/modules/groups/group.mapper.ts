import type { Group } from '@kidzzy/shared';
import type { GroupRow } from './group.repository';
import { sortSlots, timeToString } from './schedule';

/**
 * openapi.yaml: Group. Built field by field, so a new column never leaks into the API.
 * studentCount counts the open enrollments (US-08).
 */
export function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    instructor: { id: row.instructor.id, name: row.instructor.name },
    startDate: row.startDate.toISOString().slice(0, 10),
    isActive: row.isActive,
    schedule: sortSlots(
      row.slots.map((slot) => ({
        weekday: slot.weekday,
        startTime: timeToString(slot.startTime),
        durationMin: slot.durationMin,
      })),
    ),
    studentCount: row._count.enrollments,
    heldCount: row._count.sessions,
    nextSessionAt: row.sessions[0]?.scheduledAt.toISOString() ?? null,
  };
}
