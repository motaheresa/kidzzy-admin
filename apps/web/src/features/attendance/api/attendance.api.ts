import { http } from '@/lib/http';
import type {
  AttendanceRange,
  AttendanceRecord,
  GroupAttendance,
  Page,
  SessionAttendance,
  StudentAttendanceItem,
} from '../types';

export const STUDENT_ATTENDANCE_PAGE_SIZE = 20;

function sessionPath(sessionId: string): string {
  return '/sessions/' + encodeURIComponent(sessionId) + '/attendance';
}

/** GET /sessions/{id}/attendance. Every student of the session; status null = not recorded yet. */
export function getSessionAttendance(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionAttendance> {
  return http.get<SessionAttendance>(sessionPath(sessionId), { signal });
}

/** PUT /sessions/{id}/attendance. Only the records sent change. */
export function saveSessionAttendance(
  sessionId: string,
  records: AttendanceRecord[],
): Promise<SessionAttendance> {
  return http.put<SessionAttendance>(sessionPath(sessionId), { records });
}

/** GET /groups/{id}/attendance: students by the group's Held sessions between two local dates. */
export function getGroupAttendance(
  groupId: string,
  range: AttendanceRange,
  signal?: AbortSignal,
): Promise<GroupAttendance> {
  const query = new URLSearchParams();
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  const suffix = query.size > 0 ? '?' + query.toString() : '';
  return http.get<GroupAttendance>(
    '/groups/' + encodeURIComponent(groupId) + '/attendance' + suffix,
    { signal },
  );
}

/** GET /students/{id}/attendance: one page of a student's history, newest session first. */
export function listStudentAttendance(
  studentId: string,
  page: number,
  signal?: AbortSignal,
): Promise<Page<StudentAttendanceItem>> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(STUDENT_ATTENDANCE_PAGE_SIZE),
  });
  return http.get<Page<StudentAttendanceItem>>(
    '/students/' + encodeURIComponent(studentId) + '/attendance?' + query.toString(),
    { signal },
  );
}
