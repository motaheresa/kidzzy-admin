import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { PaymentsModule } from '../payments/payments.module';
import { SessionsModule } from '../sessions/sessions.module';
import { CycleCountingService } from './cycle-counting.service';

/**
 * Counting Held sessions into payment cycles (US-22). It sits beside sessions and payments, which
 * cannot import each other's dependents, and registers itself in SessionHeldHooks when it starts.
 */
@Module({
  imports: [AcademiesModule, EnrollmentsModule, PaymentsModule, SessionsModule],
  providers: [CycleCountingService],
})
export class CyclesModule {}
