import { Module } from '@nestjs/common';
import { RUN_JOBS_ON_STARTUP } from '../../common/jobs/startup-run';
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
 * Notification center, web push and the quarter-hour push tick (TS-02, ADR-0007, ADR-0008, ADR-0016).
 * Later stories call NotificationsService.notify. Session reminders are their own job.
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
    { provide: RUN_JOBS_ON_STARTUP, useValue: true },
  ],
  exports: [NotificationsService, RUN_JOBS_ON_STARTUP],
})
export class NotificationsModule {}
