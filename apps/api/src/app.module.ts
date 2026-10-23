import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './common/config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { GroupsModule } from './modules/groups/groups.module';
import { HealthModule } from './modules/health/health.module';
import { InstructorsModule } from './modules/instructors/instructors.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { StudentsModule } from './modules/students/students.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';

@Module({
  imports: [
    // validateEnv runs once, before anything starts: a bad variable stops the API at startup.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // @Cron jobs (ADR-0007): the daily session generation runs inside the API process.
    ScheduleModule.forRoot(),
    TenancyModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    InstructorsModule,
    StudentsModule,
    GroupsModule,
    SessionsModule,
    PaymentsModule,
    EnrollmentsModule,
    AttendanceModule,
  ],
})
export class AppModule {}
