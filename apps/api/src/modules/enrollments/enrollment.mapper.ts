import type { Enrollment } from '@kidzzy/shared';
import { dateToString } from '../sessions/dates';
import type { EnrollmentRow } from './enrollment.repository';

/** openapi.yaml: Enrollment. Built field by field, so a new column never leaks into the API. */
export function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.name,
    group: { id: row.group.id, name: row.group.name },
    startDate: dateToString(row.startDate),
    endDate: row.endDate ? dateToString(row.endDate) : null,
  };
}
