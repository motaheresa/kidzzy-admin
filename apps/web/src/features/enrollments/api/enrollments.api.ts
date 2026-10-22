import { http } from '@/lib/http';
import type { Enrollment, EnrollRequest, TransferRequest } from '../types';

// The enrollment endpoints (openapi.yaml, US-08 and US-09), as plain functions over the http
// client. Components never call them; the hooks in ../hooks do.

const groupPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/enrollments`;
const studentPath = (studentId: string) => `/students/${encodeURIComponent(studentId)}`;

/** GET /groups/{id}/enrollments: the group's current students. */
export async function listGroupEnrollments(
  groupId: string,
  signal?: AbortSignal,
): Promise<Enrollment[]> {
  return (await http.get<{ data: Enrollment[] }>(groupPath(groupId), { signal })).data;
}

/** POST /groups/{id}/enrollments: the student joins with a plan and a starting point. */
export function enrollStudent(groupId: string, input: EnrollRequest): Promise<Enrollment> {
  return http.post<Enrollment>(groupPath(groupId), input);
}

/** GET /students/{id}/enrollments: the student's group history, the latest first. */
export async function listStudentEnrollments(
  studentId: string,
  signal?: AbortSignal,
): Promise<Enrollment[]> {
  const path = `${studentPath(studentId)}/enrollments`;
  return (await http.get<{ data: Enrollment[] }>(path, { signal })).data;
}

/** POST /students/{id}/transfer: the student moves to another group; answers the new enrollment. */
export function transferStudent(studentId: string, input: TransferRequest): Promise<Enrollment> {
  return http.post<Enrollment>(`${studentPath(studentId)}/transfer`, input);
}
