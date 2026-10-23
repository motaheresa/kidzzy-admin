import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { GroupsModule } from '../groups/groups.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StudentsModule } from '../students/students.module';
import { AttendanceViewsService } from './attendance-views.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';
import { GroupAttendanceController } from './group-attendance.controller';
import { StudentAttendanceController } from './student-attendance.controller';

/**
 * Attendance and ratings of a Held session (US-18, US-37) and reading them across sessions
 * (US-19). It reads sessions, enrollments, groups and students through their exported
 * repositories; none of those modules imports this one.
 */
@Module({
  imports: [AcademiesModule, EnrollmentsModule, GroupsModule, SessionsModule, StudentsModule],
  controllers: [AttendanceController, GroupAttendanceController, StudentAttendanceController],
  providers: [AttendanceRepository, AttendanceService, AttendanceViewsService],
})
export class AttendanceModule {}
