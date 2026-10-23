import { useApiMutation, useApiQuery, useQueryClient } from '@/lib/query';
import { getSessionAttendance, saveSessionAttendance } from '../api/attendance.api';
import { attendanceKeys } from '../api/attendance.keys';
import type { AttendanceRecord } from '../types';

/** The students of a session with what is recorded. The screen shows its own error. */
export function useSessionAttendance(sessionId: string, enabled = true) {
  return useApiQuery({
    queryKey: attendanceKeys.session(sessionId),
    queryFn: ({ signal }) => getSessionAttendance(sessionId, signal),
    enabled,
    meta: { errorHandling: 'local' },
  });
}

/** Saves some records. The response is the whole session again, so the cache takes it as is. */
export function useSaveAttendance(sessionId: string) {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (records: AttendanceRecord[]) => saveSessionAttendance(sessionId, records),
    meta: { errorHandling: 'local' },
    onSuccess: (result) => {
      queryClient.setQueryData(attendanceKeys.session(sessionId), result);
    },
  });
}
