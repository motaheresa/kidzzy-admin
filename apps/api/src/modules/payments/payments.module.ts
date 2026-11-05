import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { AuditModule } from '../audit/audit.module';
import { GroupsModule } from '../groups/groups.module';
import { InstructorsModule } from '../instructors/instructors.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StudentsModule } from '../students/students.module';
import { UsersModule } from '../users/users.module';
import { PaymentCycleRepository } from './payment-cycle.repository';
import { PaymentReminderRepository } from './payment-reminder.repository';
import { PaymentReminderService } from './payment-reminder.service';
import { PaymentCyclesController } from './payment-cycles.controller';
import { PaymentCyclesService } from './payment-cycles.service';
import { PaymentPlanRepository } from './payment-plan.repository';
import { PaymentRepository } from './payment.repository';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentPlansService } from './payment-plans.service';

/**
 * Payment plans and cycles (FR-15, FR-16). Enrolling a student starts their plan and first cycle
 * (US-08); changing a student's plan and reading the versions are US-20. An instructor's plan and
 * cycles are per group (ADR-0015); reading the cycles is US-24 and US-25, and recording the payment of a Due cycle is US-23. AccessContext comes
 * from the global AuthModule.
 */
@Module({
  imports: [
    AcademiesModule,
    AuditModule,
    StudentsModule,
    InstructorsModule,
    GroupsModule,
    NotificationsModule,
    SessionsModule,
    UsersModule,
  ],
  controllers: [PaymentPlansController, PaymentCyclesController, PaymentsController],
  providers: [
    PaymentPlanRepository,
    PaymentCycleRepository,
    PaymentPlansService,
    PaymentCyclesService,
    PaymentRepository,
    PaymentsService,
    PaymentReminderRepository,
    PaymentReminderService,
  ],
  exports: [PaymentPlanRepository, PaymentCycleRepository, PaymentReminderService],
})
export class PaymentsModule {}
