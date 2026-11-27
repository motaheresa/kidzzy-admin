import { HttpStatus, Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import {
  ErrorCode,
  NotificationType,
  type Announcement,
  type AudienceRole,
  type AudienceUser,
  type Page,
  type RecipientsCount,
} from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import type { PageQueryDto } from '../../common/pagination/page-query.dto';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AuditService } from '../audit/audit.service';
import { AccessContext } from '../auth/access-context';
import { NotificationsService } from '../notifications/notifications.service';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { toAnnouncement, toAudienceUser } from './announcement.mapper';
import { AnnouncementRepository } from './announcement.repository';
import type { AudienceDto } from './dto/audience.dto';
import type { CreateAnnouncementDto } from './dto/create-announcement.dto';
import type { ListAudienceUsersQueryDto } from './dto/list-audience-users.query';

/** Where tapping an announcement goes: the notification center, which shows its full text. */
const ANNOUNCEMENT_URL = '/notifications';

/**
 * A send writes two rows per recipient (the notification and its push job), one after the other.
 * Prisma's default of 5 seconds for a transaction is too short for a large academy.
 */
const SEND_TIMEOUT_MS = 30_000;

/**
 * Announcements (US-31). An announcement is sent once and is never edited or deleted. Delivery
 * is the notification center's: one notify() per recipient, so the row appears at once and the
 * push goes out on the next tick, like every other notification.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly announcements: AnnouncementRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly access: AccessContext,
  ) {}

  async list(query: PageQueryDto): Promise<Page<Announcement>> {
    const { rows, total } = await this.announcements.list(pageWindow(query));
    return toPage(rows.map(toAnnouncement), query, total);
  }

  /** How many people a send with this audience would reach now, with the same rules. */
  async count(query: AudienceDto): Promise<RecipientsCount> {
    const { recipientIds } = await this.resolveAudience(query);
    return { count: recipientIds.length };
  }

  @Transactional<TenantTransactionalAdapter>({ timeout: SEND_TIMEOUT_MS })
  async send(dto: CreateAnnouncementDto): Promise<Announcement> {
    const { recipientIds, roleId, userIds } = await this.resolveAudience(dto);
    const created = await this.announcements.create({
      senderId: this.access.userId,
      title: dto.title,
      body: dto.body,
      audience: dto.audience,
      roleId,
      recipientCount: recipientIds.length,
    });
    // One at a time: the queries of a transaction share one database connection.
    for (const recipientId of recipientIds) {
      await this.notifications.notify(recipientId, {
        type: NotificationType.Announcement,
        title: created.title,
        body: created.body,
        data: { url: ANNOUNCEMENT_URL, announcementId: created.id },
      });
    }
    await this.audit.record({
      action: 'announcement.sent',
      entityType: 'announcements',
      entityId: created.id,
      after: {
        title: created.title,
        audience: created.audience,
        ...(roleId ? { roleId } : {}),
        ...(userIds ? { userIds } : {}),
        recipientCount: created.recipientCount,
      },
    });
    return toAnnouncement(created);
  }

  async listRoles(): Promise<AudienceRole[]> {
    return (await this.announcements.listRoles()).map(({ id, name }) => ({ id, name }));
  }

  async listUsers(query: ListAudienceUsersQueryDto): Promise<Page<AudienceUser>> {
    const { rows, total } = await this.announcements.listUsers(
      query.search ?? undefined,
      this.access.userId,
      pageWindow(query),
    );
    return toPage(rows.map(toAudienceUser), query, total);
  }

  /**
   * Who receives an announcement with this audience: the one rule for both the count and the
   * send, so they cannot disagree. The sender never receives their own.
   * 422 VALIDATION_FAILED for a role or a person that is not this academy's active one, and
   * 422 ANNOUNCEMENT_NO_RECIPIENTS when nobody is left.
   */
  private async resolveAudience(
    dto: AudienceDto,
  ): Promise<{ recipientIds: string[]; roleId: string | null; userIds: string[] | null }> {
    const senderId = this.access.userId;
    let recipientIds: string[];
    let roleId: string | null = null;
    let userIds: string[] | null = null;

    if (dto.audience === 'role') {
      // The DTO requires roleId for this audience.
      const role = await this.announcements.findRole(dto.roleId!);
      if (!role) throw invalidAudience('roleId', 'No such role in this academy');
      roleId = role.id;
      recipientIds = await this.announcements.listActiveUserIdsInRole(role.id, senderId);
    } else if (dto.audience === 'users') {
      // The database returns lower-case ids, so compare in that form.
      userIds = [...new Set(dto.userIds!.map((id) => id.toLowerCase()))].filter(
        (id) => id !== senderId,
      );
      recipientIds = await this.announcements.listActiveUserIdsAmong(userIds);
      const missing = userIds.length - recipientIds.length;
      if (missing > 0) {
        throw invalidAudience(
          'userIds',
          `${missing} of the chosen users are unknown or inactive in this academy`,
        );
      }
    } else {
      recipientIds = await this.announcements.listActiveUserIds(senderId);
    }

    if (recipientIds.length === 0) {
      throw new AppException(
        ErrorCode.AnnouncementNoRecipients,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The audience has no active user to send to',
      );
    }
    return { recipientIds, roleId, userIds };
  }
}

function invalidAudience(field: 'roleId' | 'userIds', message: string): AppException {
  return new AppException(ErrorCode.ValidationFailed, HttpStatus.UNPROCESSABLE_ENTITY, message, [
    { field, message },
  ]);
}
