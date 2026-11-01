import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import type { TenantTransactionalAdapter } from '../prisma/transaction';
import { TenantContext } from '../tenancy/tenant-context';
import { MAX_PUSH_ATTEMPTS, NOTIFICATION_PUSH } from './push.constants';

/** The payload of a notification.push job. `pendingSubscriptionIds` is set after a failed try. */
export type PushJobPayload = { notificationId: string; pendingSubscriptionIds?: string[] };

export type JobFailure = { lastError: string; runAt: Date; payload: PushJobPayload };

/** Locks and updates reminder jobs. Raw SQL filters academy_id itself. */
@Injectable()
export class ReminderJobRepository {
  constructor(
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
    private readonly tenant: TenantContext,
  ) {}

  /** Queues delivery of a notification that was just written in this same transaction. */
  async enqueue(notificationId: string, runAt: Date): Promise<void> {
    await this.txHost.tx.reminderJob.create({
      data: {
        academyId: this.tenant.requireAcademyId(),
        kind: NOTIFICATION_PUSH,
        payload: { notificationId },
        runAt,
      },
    });
  }

  /**
   * Locks the next due job of this academy until the transaction commits. SKIP LOCKED means a
   * second tick takes a different job, or nothing, instead of sending this one again.
   */
  async lockNextDue(now: Date): Promise<string | null> {
    const academyId = this.tenant.requireAcademyId();
    const rows = await this.txHost.tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM reminder_jobs
      WHERE academy_id = ${academyId}::uuid
        AND kind = ${NOTIFICATION_PUSH}
        AND sent_at IS NULL
        AND run_at <= ${now}
        AND attempts < ${MAX_PUSH_ATTEMPTS}
      ORDER BY run_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    return rows[0]?.id ?? null;
  }

  findPayload(id: string): Promise<{ payload: unknown; attempts: number } | null> {
    return this.txHost.tx.reminderJob.findUnique({
      where: { id },
      select: { payload: true, attempts: true },
    });
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.txHost.tx.reminderJob.update({
      where: { id },
      data: { sentAt, lastError: null },
    });
  }

  /**
   * Counts a failed try, moves run_at forward and keeps only the subscriptions that still have to
   * receive the push, so a retry never sends to a browser that already got it.
   */
  async recordFailure(id: string, failure: JobFailure): Promise<void> {
    await this.txHost.tx.reminderJob.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: failure.lastError,
        runAt: failure.runAt,
        payload: failure.payload,
      },
    });
  }
}
