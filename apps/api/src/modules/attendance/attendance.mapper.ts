import type {
  GroupAttendance,
  SessionAttendance,
  StudentAttendanceItem,
  StudentRef,
} from '@kidzzy/shared';
import type { EnrollmentRow } from '../enrollments/enrollment.repository';
import { toSession } from '../sessions/session.mapper';
import type { SessionRow } from '../sessions/session.repository';
import type {
  AttendanceRow,
  GridAttendanceRow,
  HistoryAttendanceRow,
} from './attendance.repository';

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

/**
 * openapi.yaml: GroupAttendance. The students come in the order given (by name); each student's
 * records follow the order of the sessions and hold only the cells that were recorded.
 */
export function toGroupAttendance(
  sessions: SessionRow[],
  students: StudentRef[],
  recorded: GridAttendanceRow[],
): GroupAttendance {
  const byStudent = new Map<string, Map<string, GridAttendanceRow>>();
  for (const row of recorded) {
    const cells = byStudent.get(row.studentId) ?? new Map<string, GridAttendanceRow>();
    cells.set(row.sessionId, row);
    byStudent.set(row.studentId, cells);
  }
  return {
    sessions: sessions.map(toSession),
    students: students.map((student) => ({
      student,
      records: sessions.flatMap((session) => {
        const row = byStudent.get(student.id)?.get(session.id);
        return row
          ? [
              {
                sessionId: session.id,
                status: row.status,
                performanceRating: row.performanceRating,
                homeworkRating: row.homeworkRating,
              },
            ]
          : [];
      }),
    })),
  };
}

/** openapi.yaml: StudentAttendanceItem. */
export function toStudentAttendanceItem(row: HistoryAttendanceRow): StudentAttendanceItem {
  return {
    sessionId: row.session.id,
    scheduledAt: row.session.scheduledAt.toISOString(),
    sessionNumber: row.session.sessionNumber,
    group: { id: row.session.group.id, name: row.session.group.name },
    status: row.status,
    performanceRating: row.performanceRating,
    homeworkRating: row.homeworkRating,
  };
}
