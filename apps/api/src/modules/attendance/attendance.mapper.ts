import type { SessionAttendance } from '@kidzzy/shared';
import type { EnrollmentRow } from '../enrollments/enrollment.repository';
import type { AttendanceRow } from './attendance.repository';

/**
 * openapi.yaml: SessionAttendance. Every student of the session, in the order given (by
 * name); a student nobody recorded yet has status null and no ratings.
 */
export function toSessionAttendance(
  sessionId: string,
  students: EnrollmentRow[],
  recorded: AttendanceRow[],
): SessionAttendance {
  const byStudent = new Map(recorded.map((row) => [row.studentId, row]));
  return {
    sessionId,
    records: students.map((enrollment) => {
      const row = byStudent.get(enrollment.studentId);
      return {
        studentId: enrollment.studentId,
        studentName: enrollment.student.name,
        status: row?.status ?? null,
        performanceRating: row?.performanceRating ?? null,
        homeworkRating: row?.homeworkRating ?? null,
      };
    }),
  };
}
