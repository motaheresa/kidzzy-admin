import { http } from '@/lib/http';
import type { AttendanceRecord, SessionAttendance } from '../types';

function path(sessionId: string): string {
  return '/sessions/' + encodeURIComponent(sessionId) + '/attendance';
}

/** GET /sessions/{id}/attendance. Every student of the session; status null = not recorded yet. */
export function getSessionAttendance(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionAttendance> {
  return http.get<SessionAttendance>(path(sessionId), { signal });
}

/** PUT /sessions/{id}/attendance. Only the records sent change. */
export function saveSessionAttendance(
  sessionId: string,
  records: AttendanceRecord[],
): Promise<SessionAttendance> {
  return http.put<SessionAttendance>(path(sessionId), { records });
}
