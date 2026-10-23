import type { AttendanceRange } from '../types';

// Query keys of the attendance feature.
export const attendanceKeys = {
  all: ['attendance'] as const,
  session: (sessionId: string) => [...attendanceKeys.all, 'session', sessionId] as const,
  groups: () => [...attendanceKeys.all, 'group'] as const,
  group: (groupId: string, range: AttendanceRange) =>
    [...attendanceKeys.groups(), groupId, range] as const,
  students: () => [...attendanceKeys.all, 'student'] as const,
  student: (studentId: string, page: number) =>
    [...attendanceKeys.students(), studentId, page] as const,
};
