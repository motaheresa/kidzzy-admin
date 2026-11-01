import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenancy/tenant-context';

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * A browser's push endpoint. The unique key is global, so finding a row that may belong to
 * another academy uses prisma.unscoped and returns only id and academyId.
 */
@Injectable()
export class PushSubscriptionRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * UNSCOPED ON PURPOSE: `endpoint` is unique across every academy, and the tenant filter would
   * hide another academy's row. The caller then deletes that row and creates one here. Only the
   * id and the academy come back; keys and the user id stay in the database.
   */
  findAcademyByEndpoint(endpoint: string): Promise<{ id: string; academyId: string } | null> {
    return this.prisma.unscoped.pushSubscription.findUnique({
      where: { endpoint },
      select: { id: true, academyId: true },
    });
  }

  /** Removes a subscription that belongs to another academy, so this academy can create its own. */
  deleteUnscoped(id: string): Promise<void> {
    return this.prisma.unscoped.pushSubscription.delete({ where: { id } }).then(() => undefined);
  }

  /**
   * Creates the subscription, or updates it when this academy already has the endpoint
   * (the same browser signed in as someone else here).
   */
  async save(input: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
  }): Promise<PushSubscriptionRow> {
    const current = await this.txHost.tx.pushSubscription.findFirst({
      where: { endpoint: input.endpoint },
      select: { id: true },
    });
    const data = {
      userId: input.userId,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
    };
    if (current) {
      return this.txHost.tx.pushSubscription.update({
        where: { id: current.id },
        data,
        select: this.select(),
      });
    }
    return this.txHost.tx.pushSubscription.create({
      data: { ...data, endpoint: input.endpoint, academyId: this.tenant.requireAcademyId() },
      select: this.select(),
    });
  }

  /** This user's subscription, or null (another user, or another academy). */
  findOwned(id: string, userId: string): Promise<{ id: string } | null> {
    return this.txHost.tx.pushSubscription.findFirst({
      where: { id, userId },
      select: { id: true },
    });
  }

  listForUser(userId: string): Promise<PushSubscriptionRow[]> {
    return this.txHost.tx.pushSubscription.findMany({
      where: { userId },
      select: this.select(),
    });
  }

  async deleteOwned(id: string): Promise<void> {
    await this.txHost.tx.pushSubscription.delete({ where: { id } });
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.txHost.tx.pushSubscription.update({ where: { id }, data: { lastUsedAt: at } });
  }

  private select() {
    return {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      userAgent: true,
      createdAt: true,
    } as const;
  }
}
