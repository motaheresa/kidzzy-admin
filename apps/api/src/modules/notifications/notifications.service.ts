import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transactional } from '@nestjs-cls/transactional';
import {
  ErrorCode,
  type AppNotification,
  type NotificationType,
  type Page,
  type PushSubscription,
  type UnreadCount,
} from '@kidzzy/shared';
import { AppException } from '../../common/errors/app.exception';
import { pageWindow, toPage } from '../../common/pagination/page';
import { AccessContext } from '../auth/access-context';
import { TenantContext } from '../tenancy/tenant-context';
import type { ListNotificationsQueryDto } from './dto/list-notifications.query';
import type { PushSubscriptionCreateDto } from './dto/push-subscription.create';
import { toNotification, toPushSubscription } from './notification.mapper';
import { NotificationRepository, type NotificationData } from './notification.repository';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { ReminderJobRepository } from './reminder-job.repository';

/** What a later story passes to notify. `data.url` is opened when the reader taps the row. */
export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: NotificationData;
}

/**
 * The notification center (TS-02). A user reads and changes only their own rows.
 * notify writes the row and a reminder job in one transaction. The tick sends the push later,
 * so a push failure cannot roll back the notification.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly subscriptions: PushSubscriptionRepository,
    private readonly jobs: ReminderJobRepository,
    private readonly access: AccessContext,
    private readonly tenant: TenantContext,
    private readonly config: ConfigService,
  ) {}

  @Transactional()
  async notify(userId: string, input: NotifyInput): Promise<AppNotification> {
    const row = await this.notifications.create({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    });
    await this.jobs.enqueue(row.id, new Date());
    return toNotification(row);
  }

  async list(query: ListNotificationsQueryDto): Promise<Page<AppNotification>> {
    const { rows, total } = await this.notifications.list(
      this.access.userId,
      query.unread,
      pageWindow(query),
    );
    return toPage(rows.map(toNotification), query, total);
  }

  async unreadCount(): Promise<UnreadCount> {
    return { count: await this.notifications.countUnread(this.access.userId) };
  }

  async markRead(id: string): Promise<void> {
    const found = await this.notifications.markRead(id, this.access.userId, new Date());
    if (!found) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such notification');
    }
  }

  async markAllRead(): Promise<void> {
    await this.notifications.markAllRead(this.access.userId, new Date());
  }

  publicKey(): { publicKey: string } {
    return { publicKey: this.config.getOrThrow<string>('VAPID_PUBLIC_KEY') };
  }

  /**
   * Registers this browser. An endpoint already stored for another academy is deleted (unscoped)
   * and created again here. An endpoint already in this academy is updated, including the user.
   */
  @Transactional()
  async subscribe(input: PushSubscriptionCreateDto): Promise<PushSubscription> {
    const existing = await this.subscriptions.findAcademyByEndpoint(input.endpoint);
    if (existing && existing.academyId !== this.tenant.requireAcademyId()) {
      await this.subscriptions.deleteUnscoped(existing.id);
    }
    const row = await this.subscriptions.save({
      userId: this.access.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    });
    return toPushSubscription(row);
  }

  async unsubscribe(id: string): Promise<void> {
    const found = await this.subscriptions.findOwned(id, this.access.userId);
    if (!found) {
      throw new AppException(ErrorCode.NotFound, HttpStatus.NOT_FOUND, 'No such subscription');
    }
    await this.subscriptions.deleteOwned(id);
  }
}
