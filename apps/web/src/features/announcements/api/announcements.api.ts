import { http } from '@/lib/http';
import type {
  Announcement,
  AnnouncementCreate,
  Audience,
  AudienceRole,
  AudienceUser,
  Page,
  RecipientsCount,
} from '../types';

// The announcement endpoints (openapi.yaml, tag Announcements). Components never call them; the
// hooks do.

export const ANNOUNCEMENTS_PAGE_SIZE = 20;
export const PICKER_PAGE_SIZE = 10;

/** GET /announcements: one page of the sent ones, newest first. */
export function listAnnouncements(page: number, signal?: AbortSignal): Promise<Page<Announcement>> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(ANNOUNCEMENTS_PAGE_SIZE),
  });
  return http.get<Page<Announcement>>(`/announcements?${query.toString()}`, { signal });
}

/** GET /announcements/recipients-count: how many people this audience reaches now. */
export function countRecipients(audience: Audience): Promise<RecipientsCount> {
  const query = new URLSearchParams({ audience: audience.audience });
  if (audience.roleId) query.set('roleId', audience.roleId);
  let search = query.toString();
  // The commas stay as they are: encoded, 200 ids would come close to the server's URL limit.
  if (audience.userIds) {
    search += `&userIds=${audience.userIds.map(encodeURIComponent).join(',')}`;
  }
  return http.get<RecipientsCount>(`/announcements/recipients-count?${search}`);
}

/** POST /announcements */
export function sendAnnouncement(body: AnnouncementCreate): Promise<Announcement> {
  return http.post<Announcement>('/announcements', body);
}

/** GET /announcements/audience/roles */
export function listAudienceRoles(signal?: AbortSignal): Promise<AudienceRole[]> {
  return http.get<AudienceRole[]>('/announcements/audience/roles', { signal });
}

/** GET /announcements/audience/users: one page of the active users, without the caller. */
export function listAudienceUsers(
  { search, page }: { search: string; page: number },
  signal?: AbortSignal,
): Promise<Page<AudienceUser>> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(PICKER_PAGE_SIZE) });
  if (search) query.set('search', search);
  return http.get<Page<AudienceUser>>(`/announcements/audience/users?${query.toString()}`, {
    signal,
  });
}
