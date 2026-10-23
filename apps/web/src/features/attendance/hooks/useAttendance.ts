import { useApiMutation, useApiQuery, useQueryClient } from '@/lib/query';
import {
  getGroupAttendance,
  getSessionAttendance,
  listStudentAttendance,
  saveSessionAttendance,
} from '../api/attendance.api';
import { attendanceKeys } from '../api/attendance.keys';
import type { AttendanceRange, AttendanceRecord } from '../types';

/** The students of a session with what is recorded. The screen shows its own error. */
export function useSessionAttendance(sessionId: string, enabled = true) {
  return useApiQuery({
    queryKey: attendanceKeys.session(sessionId),
    queryFn: ({ signal }) => getSessionAttendance(sessionId, signal),
    enabled,
    meta: { errorHandling: 'local' },
  });
}

/**
 * Saves some records. The response is the whole session again, so the cache takes it as is, and
 * the group grids and student histories that showed older values are refreshed.
 */
export function useSaveAttendance(sessionId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (records: AttendanceRecord[]) => saveSessionAttendance(sessionId, records),
    meta: { errorHandling: 'local' },
    onSuccess: (result) => {
      queryClient.setQueryData(attendanceKeys.session(sessionId), result);
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.groups() });
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.students() });
    },
  });
}

/** A group's attendance grid for a date range. `enabled` skips the request (no permission, bad range). */
export function useGroupAttendance(groupId: string, range: AttendanceRange, enabled = true) {
  return useApiQuery({
    queryKey: attendanceKeys.group(groupId, range),
    queryFn: ({ signal }) => getGroupAttendance(groupId, range, signal),
    placeholderData: (previous) => previous,
    enabled,
    meta: { errorHandling: 'local' },
  });
}

/** One page of a student's attendance history. */
export function useStudentAttendance(studentId: string, page: number, enabled = true) {
  return useApiQuery({
    queryKey: attendanceKeys.student(studentId, page),
    queryFn: ({ signal }) => listStudentAttendance(studentId, page, signal),
    placeholderData: (previous) => previous,
    enabled,
    meta: { errorHandling: 'local' },
  });
}
