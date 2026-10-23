import type {
  AttendanceRecord,
  AttendanceStatus,
  GroupAttendance,
  GroupAttendanceCell,
  Page,
  SessionAttendance,
  SessionAttendanceRecord,
  StudentAttendanceItem,
} from '@kidzzy/shared';

/** The API's attendance shapes (openapi.yaml: AttendanceRecord, SessionAttendance, …). */
export type {
  AttendanceRecord,
  AttendanceStatus,
  GroupAttendance,
  GroupAttendanceCell,
  Page,
  SessionAttendance,
  SessionAttendanceRecord,
  StudentAttendanceItem,
};

/** One student's line while it is being edited: the same fields the API saves. */
export interface AttendanceDraft {
  status: AttendanceStatus | null;
  performanceRating: number | null;
  homeworkRating: number | null;
}

/** The dates of the group grid, academy-local YYYY-MM-DD, both included. Either may be left out. */
export interface AttendanceRange {
  from?: string;
  to?: string;
}
