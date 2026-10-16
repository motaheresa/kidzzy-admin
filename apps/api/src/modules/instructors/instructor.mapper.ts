import type { GroupRef, Instructor, InstructorDetail } from '@kidzzy/shared';
import type { InstructorRow } from './instructor.repository';

/** openapi.yaml: Instructor. Built field by field, so a new column never leaks into the API. */
export function toInstructor(row: InstructorRow): Instructor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** openapi.yaml: InstructorDetail, the instructor with the groups they teach. */
export function toInstructorDetail(row: InstructorRow, groups: GroupRef[]): InstructorDetail {
  return { ...toInstructor(row), groups };
}
