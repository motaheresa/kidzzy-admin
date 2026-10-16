import type { InstructorListParams } from '../types';

// Query keys of the instructors feature, built in one place so a key is never retyped by hand.
// instructorKeys.lists() is the prefix of every list page, for invalidating them all at once.
export const instructorKeys = {
  all: ['instructors'] as const,
  lists: () => [...instructorKeys.all, 'list'] as const,
  list: (params: InstructorListParams) => [...instructorKeys.lists(), params] as const,
  details: () => [...instructorKeys.all, 'detail'] as const,
  detail: (id: string) => [...instructorKeys.details(), id] as const,
};
