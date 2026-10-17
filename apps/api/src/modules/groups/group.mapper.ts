import type { Group } from '@kidzzy/shared';
import type { GroupRow } from './group.repository';
import { sortSlots, timeToString } from './schedule';

/**
 * openapi.yaml: Group. Built field by field, so a new column never leaks into the API.
 * TODO(US-08): studentCount from the open enrollments. TODO(SCRUM-22): heldCount and
 * nextSessionAt from the sessions.
 */
export function toGroup(row: GroupRow, extras: Pick<Group, 'heldCount' | 'nextSessionAt'>): Group {
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
    studentCount: 0,
    ...extras,
  };
}
