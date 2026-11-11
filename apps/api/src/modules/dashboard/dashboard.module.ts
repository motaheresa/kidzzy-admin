import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { SessionsModule } from '../sessions/sessions.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

/**
 * The admin dashboard (US-34): one read-only endpoint over sessions, attendance and payment
 * cycles. SessionsModule provides the Clock. Nothing imports this module back.
 */
@Module({
  imports: [AcademiesModule, SessionsModule],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
