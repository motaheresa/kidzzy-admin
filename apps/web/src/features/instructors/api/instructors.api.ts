import { http } from '@/lib/http';
import type {
  Instructor,
  InstructorCreate,
  InstructorDetail,
  InstructorListParams,
  InstructorUpdate,
  Page,
} from '../types';

// The instructor endpoints (openapi.yaml, tag Instructors), as plain functions over the http
// client. Components never call them; the hooks in ../hooks do.

export const INSTRUCTORS_PAGE_SIZE = 20;

const path = (id: string) => `/instructors/${encodeURIComponent(id)}`;

/** GET /instructors: one page, with the search and the active filter when set. */
export function listInstructors(
  params: InstructorListParams,
  signal?: AbortSignal,
): Promise<Page<Instructor>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(INSTRUCTORS_PAGE_SIZE),
  });
  if (params.search) query.set('search', params.search);
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive));
  return http.get<Page<Instructor>>(`/instructors?${query.toString()}`, { signal });
}

/** GET /instructors/{id}: the instructor with their groups. */
export function getInstructor(id: string, signal?: AbortSignal): Promise<InstructorDetail> {
  return http.get<InstructorDetail>(path(id), { signal });
}

/** POST /instructors: a new account with a temporary password. */
export function createInstructor(input: InstructorCreate): Promise<Instructor> {
  return http.post<Instructor>('/instructors', input);
}

/** PATCH /instructors/{id}: only the fields sent change; null removes email or phone. */
export function updateInstructor(id: string, input: InstructorUpdate): Promise<Instructor> {
  return http.patch<Instructor>(path(id), input);
}

/** POST /instructors/{id}/deactivate or /reactivate. */
export function setInstructorActive(id: string, active: boolean): Promise<Instructor> {
  return http.post<Instructor>(`${path(id)}/${active ? 'reactivate' : 'deactivate'}`);
}
