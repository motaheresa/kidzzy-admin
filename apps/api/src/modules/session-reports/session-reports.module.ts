import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from '../users/users.module';
import { SessionReportJob } from './session-report.job';
import { SessionReportRepository } from './session-report.repository';
import { SessionReportService } from './session-report.service';

/**
 * The session reports to the admins (US-29): held, cancelled and not marked yet (SCRUM-43). A
 * module of its own because it reads sessions and attendance, and sessions cannot import
 * attendance. It registers in SessionHeldHooks, so the Held and the Cancel run it in their
 * transaction; nothing imports this module.
 */
@Module({
  imports: [AcademiesModule, AttendanceModule, NotificationsModule, SessionsModule, UsersModule],
  providers: [SessionReportRepository, SessionReportService, SessionReportJob],
})
export class SessionReportsModule {}
