import { http } from '@/lib/http';
import type { Enrollment, EnrollRequest } from '../types';

// The enrollment endpoints (openapi.yaml, US-08), as plain functions over the http client.
// Components never call them; the hooks in ../hooks do.

const path = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/enrollments`;

/** GET /groups/{id}/enrollments: the group's current students. */
export async function listGroupEnrollments(
  groupId: string,
  signal?: AbortSignal,
): Promise<Enrollment[]> {
  return (await http.get<{ data: Enrollment[] }>(path(groupId), { signal })).data;
}

/** POST /groups/{id}/enrollments: the student joins with a plan and a starting point. */
export function enrollStudent(groupId: string, input: EnrollRequest): Promise<Enrollment> {
  return http.post<Enrollment>(path(groupId), input);
}
