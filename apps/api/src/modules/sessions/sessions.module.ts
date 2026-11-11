import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Clock } from './clock';
import { SessionReminderJob } from './session-reminder.job';
import { SessionReminderRepository } from './session-reminder.repository';
import { SessionReminderService } from './session-reminder.service';
import { GroupSessionsController } from './group-sessions.controller';
import { SessionHeldHooks } from './session-held-hooks';
import { SessionRegeneration } from './session-regeneration';
import { SessionGenerationJob } from './session-generation.job';
import { SessionGenerator } from './session-generator';
import { ReminderRulesModule } from '../reminder-rules/reminder-rules.module';
import { SessionRepository } from './session.repository';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

/**
 * Sessions: generation from the weekly schedules (US-11), reading them (US-12) and marking
 * one Held (US-13). The repository is exported for attendance (US-18).
 * The repository stays inside this module; groups already import it, so it does not
 * import GroupRepository back.
 */
@Module({
  imports: [AcademiesModule, AuditModule, NotificationsModule, ReminderRulesModule],
  controllers: [SessionsController, GroupSessionsController],
  providers: [
    Clock,
    SessionRepository,
    SessionGenerator,
    SessionRegeneration,
    SessionGenerationJob,
    SessionReminderRepository,
    SessionReminderService,
    SessionReminderJob,
    SessionsService,
    SessionHeldHooks,
  ],
  exports: [Clock, SessionGenerator, SessionRegeneration, SessionRepository, SessionHeldHooks],
})
export class SessionsModule {}
