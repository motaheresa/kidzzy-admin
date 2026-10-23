import type { GroupListParams } from '../types';

// Query keys of the groups feature, built in one place so a key is never retyped by hand.
// groupKeys.lists() is the prefix of every list page, for invalidating them all at once.
export const groupKeys = {
  all: ['groups'] as const,
  lists: () => [...groupKeys.all, 'list'] as const,
  list: (params: GroupListParams) => [...groupKeys.lists(), params] as const,
  details: () => [...groupKeys.all, 'detail'] as const,
  detail: (id: string) => [...groupKeys.details(), id] as const,
  options: () => [...groupKeys.lists(), 'options'] as const,
  /** The active groups an instructor teaches now. */
  ofInstructor: (instructorId: string) =>
    [...groupKeys.lists(), 'instructor', instructorId] as const,
};
