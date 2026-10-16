import type { Student } from '@kidzzy/shared';
import type { StudentRow } from './student.repository';

/**
 * openapi.yaml: Student. Built field by field, so a new column never leaks into the API.
 * TODO(US-08): currentGroup from the open enrollment. TODO(US-12): currentCycle.
 */
export function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    age: row.age,
    parentName: row.parentName,
    parentPhone: row.parentPhone,
    notes: row.notes,
    isActive: row.isActive,
    currentGroup: null,
    currentCycle: null,
  };
}
