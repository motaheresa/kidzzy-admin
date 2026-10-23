import type {
  AttendanceRecord,
  AttendanceStatus,
  SessionAttendance,
  SessionAttendanceRecord,
} from '@kidzzy/shared';

/** The API's attendance shapes (openapi.yaml: AttendanceRecord, SessionAttendance). */
export type { AttendanceRecord, AttendanceStatus, SessionAttendance, SessionAttendanceRecord };

/** One student's line while it is being edited: the same fields the API saves. */
export interface AttendanceDraft {
  status: AttendanceStatus | null;
  performanceRating: number | null;
  homeworkRating: number | null;
}
