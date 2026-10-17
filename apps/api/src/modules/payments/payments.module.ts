import { Module } from '@nestjs/common';
import { PaymentCycleRepository } from './payment-cycle.repository';
import { PaymentPlanRepository } from './payment-plan.repository';

/**
 * Payment plans and cycles (FR-15, FR-16). Enrolling a student starts their plan and first cycle
 * (US-08); the plan endpoints come with US-20 and US-21.
 */
@Module({
  providers: [PaymentPlanRepository, PaymentCycleRepository],
  exports: [PaymentPlanRepository, PaymentCycleRepository],
})
export class PaymentsModule {}
