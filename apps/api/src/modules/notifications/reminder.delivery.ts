import { Inject, Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { NotificationRepository } from './notification.repository';
import { safeAppPath } from './safe-path';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { ReminderJobRepository } from './reminder-job.repository';
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
    const notificationId = notificationIdOf(job?.payload);
    if (!notificationId) {
      await this.jobs.markSent(id, now);
      return true;
    }

    const notification = await this.notifications.findById(notificationId);
    if (!notification) {
      await this.jobs.markSent(id, now);
      return true;
    }

    const url = safeAppPath(dataUrl(notification.data));
    const targets = await this.subscriptions.listForUser(notification.userId);
    let failed = false;
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
        // A rejected push is this subscription's problem: record it and keep the job for a retry.
        // Anything else (the push service throwing) rolls the transaction back and stops this
        // academy's tick. The job's catch still runs the next academy.
        if (!(error instanceof PushRejectedError)) throw error;
        failed = true;
        lastError = String(error.statusCode);
        this.logger.warn(
          `Push failed notification=${notification.id} subscription=${target.id} status=${error.statusCode}`,
        );
      }
    }

    if (failed) await this.jobs.recordFailure(id, lastError);
    else await this.jobs.markSent(id, now);
    return true;
  }
}

function isGone(error: unknown): boolean {
  return (
    error instanceof PushRejectedError && (error.statusCode === 404 || error.statusCode === 410)
  );
}

function notificationIdOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || !('notificationId' in payload)) {
    return undefined;
  }
  const id = payload.notificationId;
  return typeof id === 'string' ? id : undefined;
}

function dataUrl(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || Array.isArray(data) || !('url' in data)) {
    return undefined;
  }
  return data.url;
}
