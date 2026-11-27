import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementCreate,
  AudienceRole,
  AudienceUser,
  Page,
  RecipientsCount,
} from '@kidzzy/shared';

/** The API's announcement shapes (openapi.yaml: Announcement, AnnouncementCreate, ...). */
export type {
  Announcement,
  AnnouncementAudience,
  AnnouncementCreate,
  AudienceRole,
  AudienceUser,
  Page,
  RecipientsCount,
};

/** Who an announcement goes to: what the count and the send both take. */
export type Audience = Pick<AnnouncementCreate, 'audience' | 'roleId' | 'userIds'>;
