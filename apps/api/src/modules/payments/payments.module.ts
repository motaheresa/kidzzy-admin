import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { InstructorsModule } from '../instructors/instructors.module';
import { StudentsModule } from '../students/students.module';
import { PaymentCycleRepository } from './payment-cycle.repository';
import { PaymentCyclesController } from './payment-cycles.controller';
import { PaymentCyclesService } from './payment-cycles.service';
import { PaymentPlanRepository } from './payment-plan.repository';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentPlansService } from './payment-plans.service';

/**
 * Payment plans and cycles (FR-15, FR-16). Enrolling a student starts their plan and first cycle
 * (US-08); changing a student's plan and reading the versions are US-20. An instructor's plan and
 * cycles are per group (ADR-0015); reading the cycles is US-24 and US-25. AccessContext comes
 * from the global AuthModule.
 */
@Module({
  imports: [StudentsModule, InstructorsModule, GroupsModule],
  controllers: [PaymentPlansController, PaymentCyclesController],
  providers: [
    PaymentPlanRepository,
    PaymentCycleRepository,
    PaymentPlansService,
    PaymentCyclesService,
  ],
  exports: [PaymentPlanRepository, PaymentCycleRepository],
})
export class PaymentsModule {}
