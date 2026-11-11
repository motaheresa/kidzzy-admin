import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ReportsController } from './reports.controller';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

/**
 * The reports workspace (US-38): read-only endpoints over payments, cycles, plans, enrollments and
 * sessions. SessionsModule provides the Clock. Nothing imports this module back.
 */
@Module({
  imports: [AcademiesModule, SessionsModule],
  controllers: [ReportsController],
  providers: [ReportsRepository, ReportsService],
})
export class ReportsModule {}
