import type { HeldResult } from '@kidzzy/shared';
import { http } from '@/lib/http';
import type { Page, Session, SessionListParams } from '../types';

// The session read endpoints (openapi.yaml, tag Sessions). Components never call them; the hooks do.

export const SESSIONS_PAGE_SIZE = 20;

const path = (id: string) => `/sessions/${encodeURIComponent(id)}`;

/** GET /sessions: one page, earliest first, with the filters that are set. */
export function listSessions(
  params: SessionListParams,
  signal?: AbortSignal,
): Promise<Page<Session>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize ?? SESSIONS_PAGE_SIZE),
  });
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.groupId) query.set('groupId', params.groupId);
  if (params.status) query.set('status', params.status);
  if (params.isMakeup !== undefined) query.set('isMakeup', String(params.isMakeup));
  return http.get<Page<Session>>(`/sessions?${query.toString()}`, { signal });
}

/** GET /sessions/{id} */
export function getSession(id: string, signal?: AbortSignal): Promise<Session> {
  return http.get<Session>(path(id), { signal });
}

/** POST /sessions/{id}/held. cyclesUpdated is empty until cycles are counted. */
export function markSessionHeld(id: string): Promise<HeldResult> {
  return http.post<HeldResult>(`${path(id)}/held`);
}

/** POST /sessions/{id}/cancel. The reason is required. */
export function cancelSession(id: string, reason: string): Promise<Session> {
  return http.post<Session>(path(id) + '/cancel', { reason });
}

/** POST /sessions/{id}/undo-held: a Held session goes back to Scheduled (the admin only). */
export function undoSessionHeld(id: string): Promise<Session> {
  return http.post<Session>(`${path(id)}/undo-held`);
}

/** POST /sessions/{id}/reschedule: a Scheduled session moves to another instant (UTC ISO 8601). */
export function rescheduleSession(id: string, scheduledAt: string): Promise<Session> {
  return http.post<Session>(path(id) + '/reschedule', { scheduledAt });
}

/** What POST /groups/{id}/sessions takes (openapi.yaml: SessionCreate). */
export interface SessionCreateInput {
  scheduledAt: string;
  durationMin: number;
  compensatesSessionId?: string;
}

/** POST /groups/{id}/sessions: a make-up (with a link) or an extra session (without). */
export function createSession(groupId: string, input: SessionCreateInput): Promise<Session> {
  return http.post<Session>('/groups/' + encodeURIComponent(groupId) + '/sessions', input);
}
