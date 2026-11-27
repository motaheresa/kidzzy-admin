import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnnouncementRepository } from './announcement.repository';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

/**
 * Announcements (US-31, SCRUM-51). Delivery is the notification center's: notify() writes the
 * row and the push job, and the tick sends the push (ADR-0008).
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementRepository, AnnouncementsService],
})
export class AnnouncementsModule {}
