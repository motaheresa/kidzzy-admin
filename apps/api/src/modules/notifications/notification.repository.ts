import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { NotificationType } from '@kidzzy/shared';
import { Prisma } from '../../generated/prisma/client';
import type { PageWindow } from '../../common/pagination/page';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';

/** JSON stored on the notification. Callers pass this; only this file talks to Prisma. */
export type NotificationData = Prisma.InputJsonObject;

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;

/** Reads and writes the signed-in user's notifications. Queries stay in the current academy. */
@Injectable()
export class NotificationRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    data: NotificationData;
  }): Promise<NotificationRow> {
    const row = await this.txHost.tx.notification.create({
      data: {
        academyId: this.tenant.requireAcademyId(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
      },
      select: NOTIFICATION_SELECT,
    });
    return row;
  }

  async list(
    userId: string,
    unread: boolean | undefined,
    window: PageWindow,
  ): Promise<{ rows: NotificationRow[]; total: number }> {
    const where = { userId, ...(unread ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.txHost.tx.notification.findMany({
        where,
        select: NOTIFICATION_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: window.skip,
        take: window.take,
      }),
      this.txHost.tx.notification.count({ where }),
    ]);
    return { rows, total };
  }

  countUnread(userId: string): Promise<number> {
    return this.txHost.tx.notification.count({ where: { userId, readAt: null } });
  }

  /** Sets readAt when this user still has the notification unread. Returns false when it is not theirs. */
  async markRead(id: string, userId: string, readAt: Date): Promise<boolean> {
    const found = await this.txHost.tx.notification.findFirst({
      where: { id, userId },
      select: { id: true, readAt: true },
    });
    if (!found) return false;
    if (!found.readAt) {
      await this.txHost.tx.notification.update({ where: { id }, data: { readAt } });
    }
    return true;
  }

  markAllRead(userId: string, readAt: Date): Promise<void> {
    return this.txHost.tx.notification
      .updateMany({ where: { userId, readAt: null }, data: { readAt } })
      .then(() => undefined);
  }

  findById(id: string): Promise<{
    id: string;
    userId: string;
    title: string;
    body: string;
    data: Prisma.JsonValue;
  } | null> {
    return this.txHost.tx.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, title: true, body: true, data: true },
    });
  }
}
