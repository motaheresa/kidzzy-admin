import { Module } from '@nestjs/common';
import { InstructorsModule } from '../instructors/instructors.module';
import { StudentsModule } from '../students/students.module';
import { PaymentCycleRepository } from './payment-cycle.repository';
import { PaymentPlanRepository } from './payment-plan.repository';
import { PaymentPlansController } from './payment-plans.controller';
import { PaymentPlansService } from './payment-plans.service';

/**
 * Payment plans and cycles (FR-15, FR-16). Enrolling a student starts their plan and first cycle
 * (US-08); changing a student's plan and reading the versions are US-20. AccessContext comes from
 * the global AuthModule.
 */
@Module({
  imports: [StudentsModule, InstructorsModule],
  controllers: [PaymentPlansController],
  providers: [PaymentPlanRepository, PaymentCycleRepository, PaymentPlansService],
  exports: [PaymentPlanRepository, PaymentCycleRepository],
})
export class PaymentsModule {}
