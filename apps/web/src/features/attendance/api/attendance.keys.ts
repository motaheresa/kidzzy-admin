// Query keys of the attendance feature.
export const attendanceKeys = {
  all: ['attendance'] as const,
  session: (sessionId: string) => [...attendanceKeys.all, 'session', sessionId] as const,
};
