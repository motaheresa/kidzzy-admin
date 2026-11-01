import { Inject, Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotificationRepository } from './notification.repository';
import { safeAppPath } from './safe-path';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { ReminderJobRepository, type PushJobPayload } from './reminder-job.repository';
import { MAX_PUSH_ATTEMPTS, PUSH_RETRY_DELAY_MINUTES } from './push.constants';
import { PUSH_SENDER, PushRejectedError, type PushSender } from './push-sender';

/**
 * Sends one due job inside its own transaction, so the row lock is held only for that send.
 * Called through the injected instance (not `this`) so @Transactional actually opens a transaction.
 */
@Injectable()
export class ReminderDelivery {
  private readonly logger = new Logger(ReminderDelivery.name);

  constructor(
    private readonly jobs: ReminderJobRepository,
    private readonly notifications: NotificationRepository,
    private readonly subscriptions: PushSubscriptionRepository,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
  ) {}

  /** True when a job was taken. False when this academy has nothing due. */
  @Transactional()
  async deliverOne(): Promise<boolean> {
    const now = new Date();
    const id = await this.jobs.lockNextDue(now);
    if (!id) return false;

    const job = await this.jobs.findPayload(id);
    const payload = payloadOf(job?.payload);
    if (!job || !payload) {
      await this.jobs.markSent(id, now);
      return true;
    }

    const notification = await this.notifications.findById(payload.notificationId);
    if (!notification) {
      await this.jobs.markSent(id, now);
      return true;
    }

    const url = safeAppPath(dataUrl(notification.data));
    // The first try goes to every subscription. A retry goes only to the ones that failed.
    const pending = payload.pendingSubscriptionIds;
    const targets = (await this.subscriptions.listForUser(notification.userId)).filter(
      (target) => !pending || pending.includes(target.id),
    );
    const failedIds: string[] = [];
    let lastError = '';
    for (const target of targets) {
      try {
        await this.sender.send(target, {
          title: notification.title,
          body: notification.body,
          ...(url ? { url } : {}),
        });
        await this.subscriptions.touch(target.id, now);
      } catch (error) {
        if (isGone(error)) {
          await this.subscriptions.deleteOwned(target.id);
          continue;
        }
        // Any failure of one send (a status, a timeout, a network error) is this subscription's
        // problem. It is recorded below and must never leave this loop, or the same job would be
        // first in line on every tick and block the academy's later notifications.
        failedIds.push(target.id);
        lastError = describeFailure(error);
        this.logger.warn(
          `Push failed notification=${notification.id} subscription=${target.id} error=${lastError}`,
        );
      }
    }

    if (failedIds.length === 0) {
      await this.jobs.markSent(id, now);
      return true;
    }

    const attempts = job.attempts + 1;
    await this.jobs.recordFailure(id, {
      lastError,
      runAt: new Date(now.getTime() + retryDelayMs(attempts)),
      payload: { notificationId: notification.id, pendingSubscriptionIds: failedIds },
    });
    if (attempts >= MAX_PUSH_ATTEMPTS) {
      this.logger.warn(
        `Push gave up job=${id} notification=${notification.id} attempts=${attempts}`,
      );
    }
    return true;
  }
}

/** The status for a refusal, otherwise the error's class name. Never the message: it may hold an endpoint. */
function describeFailure(error: unknown): string {
  if (error instanceof PushRejectedError) return String(error.statusCode);
  return error instanceof Error ? error.name : 'unknown';
}

/** Wait before the next try after `attempts` failed tries. Past the table, the longest wait. */
function retryDelayMs(attempts: number): number {
  const delays = PUSH_RETRY_DELAY_MINUTES;
  const minutes = delays[Math.min(attempts, delays.length) - 1] ?? 0;
  return minutes * 60_000;
}

function isGone(error: unknown): boolean {
  return (
    error instanceof PushRejectedError && (error.statusCode === 404 || error.statusCode === 410)
  );
}

function payloadOf(payload: unknown): PushJobPayload | undefined {
  if (typeof payload !== 'object' || payload === null || !('notificationId' in payload)) {
    return undefined;
  }
  const { notificationId } = payload;
  if (typeof notificationId !== 'string') return undefined;
  const pending = 'pendingSubscriptionIds' in payload ? payload.pendingSubscriptionIds : undefined;
  return Array.isArray(pending)
    ? {
        notificationId,
        pendingSubscriptionIds: pending.filter((item): item is string => typeof item === 'string'),
      }
    : { notificationId };
}

function dataUrl(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data) || !('url' in data)) {
    return undefined;
  }
  return data.url;
}
