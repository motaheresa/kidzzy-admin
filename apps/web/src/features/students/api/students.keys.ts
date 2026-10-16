import type { StudentListParams } from '../types';

// Query keys of the students feature, built in one place so a key is never retyped by hand.
// studentKeys.lists() is the prefix of every list page, for invalidating them all at once.
export const studentKeys = {
  all: ['students'] as const,
  lists: () => [...studentKeys.all, 'list'] as const,
  list: (params: StudentListParams) => [...studentKeys.lists(), params] as const,
  details: () => [...studentKeys.all, 'detail'] as const,
  detail: (id: string) => [...studentKeys.details(), id] as const,
};
