import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { SessionsModule } from '../sessions/sessions.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceService } from './attendance.service';

/**
 * Attendance and ratings of a Held session (US-18, US-37, US-19). It reads sessions and
 * enrollments through their exported repositories; neither of those modules imports this one.
 */
@Module({
  imports: [AcademiesModule, EnrollmentsModule, SessionsModule],
  controllers: [AttendanceController],
  providers: [AttendanceRepository, AttendanceService],
})
export class AttendanceModule {}
