// Query keys of the enrollments feature, built in one place so a key is never retyped by hand.
export const enrollmentKeys = {
  all: ['enrollments'] as const,
  /** A group's current students. */
  group: (groupId: string) => [...enrollmentKeys.all, 'group', groupId] as const,
};
