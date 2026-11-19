// Query keys of the evaluations feature, built in one place so a key is never retyped by hand.
export const evaluationKeys = {
  all: ['evaluations'] as const,
  mine: () => [...evaluationKeys.all, 'mine'] as const,
  pending: () => [...evaluationKeys.all, 'pending'] as const,
  student: (studentId: string) => [...evaluationKeys.all, 'student', studentId] as const,
  settings: () => [...evaluationKeys.all, 'settings'] as const,
};
