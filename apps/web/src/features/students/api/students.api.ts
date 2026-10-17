import { http } from '@/lib/http';
import type { Page, Student, StudentCreate, StudentListParams, StudentUpdate } from '../types';

// The student endpoints (openapi.yaml, tag Students), as plain functions over the http client.
// Components never call them; the hooks in ../hooks do.

export const STUDENTS_PAGE_SIZE = 20;

const path = (id: string) => `/students/${encodeURIComponent(id)}`;

/** GET /students: one page, with the search and the active filter when set. */
export function listStudents(
  params: StudentListParams,
  signal?: AbortSignal,
): Promise<Page<Student>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(STUDENTS_PAGE_SIZE),
  });
  if (params.search) query.set('search', params.search);
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive));
  return http.get<Page<Student>>(`/students?${query.toString()}`, { signal });
}

/** GET /students/{id} */
export function getStudent(id: string, signal?: AbortSignal): Promise<Student> {
  return http.get<Student>(path(id), { signal });
}

/** POST /students */
export function createStudent(input: StudentCreate): Promise<Student> {
  return http.post<Student>('/students', input);
}

/** PATCH /students/{id}: only the fields sent change; null clears age or notes. */
export function updateStudent(id: string, input: StudentUpdate): Promise<Student> {
  return http.patch<Student>(path(id), input);
}

/** POST /students/{id}/deactivate */
export function deactivateStudent(id: string): Promise<Student> {
  return http.post<Student>(`${path(id)}/deactivate`);
}
