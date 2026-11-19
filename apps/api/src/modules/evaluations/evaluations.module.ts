import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { AuditModule } from '../audit/audit.module';
import { CyclesModule } from '../cycles/cycles.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsModule } from '../sessions/sessions.module';
import { EvaluationRequestHook } from './evaluation-request.hook';
import { EvaluationsDataModule } from './evaluations-data.module';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';

/**
 * Required student evaluations (US-42, SCRUM-87). It imports CyclesModule (which exports nothing)
 * only so Nest initialises the cycle counting first: the counting hook then registers before this
 * module's hook, and afterHeld / onUndone see the cycles already counted or taken back.
 */
@Module({
  imports: [
    AcademiesModule,
    AuditModule,
    CyclesModule,
    EvaluationsDataModule,
    NotificationsModule,
    SessionsModule,
  ],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, EvaluationRequestHook],
})
export class EvaluationsModule {}
