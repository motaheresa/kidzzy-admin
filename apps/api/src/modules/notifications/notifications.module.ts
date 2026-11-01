import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { NotificationRepository } from './notification.repository';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PUSH_SENDER, WebPushSender } from './push-sender';
import { PushSubscriptionRepository } from './push-subscription.repository';
import { ReminderDelivery } from './reminder.delivery';
import { ReminderJob } from './reminder.job';
import { ReminderJobRepository } from './reminder-job.repository';

/**
 * Notification center, web push and the minute reminder tick (TS-02, ADR-0007, ADR-0008).
 * Later stories call NotificationsService.notify. This module does not produce reminders itself.
 */
@Module({
  imports: [AcademiesModule],
  controllers: [NotificationsController],
  providers: [
    NotificationRepository,
    PushSubscriptionRepository,
    ReminderJobRepository,
    NotificationsService,
    ReminderDelivery,
    ReminderJob,
    WebPushSender,
    { provide: PUSH_SENDER, useExisting: WebPushSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
