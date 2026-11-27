import type { Announcement, AudienceUser } from '@kidzzy/shared';
import type { AnnouncementRow, AudienceUserRow } from './announcement.repository';

export function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    roleId: row.roleId,
    roleName: row.role?.name ?? null,
    recipientCount: row.recipientCount,
    sender: { id: row.sender.id, name: row.sender.name },
    createdAt: row.createdAt.toISOString(),
  };
}

export function toAudienceUser(row: AudienceUserRow): AudienceUser {
  return { id: row.id, name: row.name, roles: row.roles.map(({ role }) => role.name) };
}
