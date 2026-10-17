import { http } from '@/lib/http';
import type {
  Group,
  GroupCreate,
  GroupListParams,
  GroupUpdate,
  Page,
  ScheduleReplace,
} from '../types';

// The group endpoints (openapi.yaml, tag Groups), as plain functions over the http client.
// Components never call them; the hooks in ../hooks do.

export const GROUPS_PAGE_SIZE = 20;

const path = (id: string) => `/groups/${encodeURIComponent(id)}`;

/** GET /groups: one page, with the search and the active filter when set. */
export function listGroups(params: GroupListParams, signal?: AbortSignal): Promise<Page<Group>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(GROUPS_PAGE_SIZE),
  });
  if (params.search) query.set('search', params.search);
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive));
  return http.get<Page<Group>>(`/groups?${query.toString()}`, { signal });
}

/** GET /groups/{id} */
export function getGroup(id: string, signal?: AbortSignal): Promise<Group> {
  return http.get<Group>(path(id), { signal });
}

/** POST /groups: the group with its weekly schedule. */
export function createGroup(input: GroupCreate): Promise<Group> {
  return http.post<Group>('/groups', input);
}

/** PATCH /groups/{id}: only the fields sent change (instructorId needs the admin). */
export function updateGroup(id: string, input: GroupUpdate): Promise<Group> {
  return http.patch<Group>(path(id), input);
}

/** PUT /groups/{id}/schedule: replaces the weekly schedule and rebuilds the future sessions. */
export function replaceGroupSchedule(id: string, input: ScheduleReplace): Promise<Group> {
  return http.put<Group>(`${path(id)}/schedule`, input);
}
