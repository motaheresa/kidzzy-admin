import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { PaymentsModule } from '../payments/payments.module';
import { StudentsModule } from '../students/students.module';
import { EnrollmentRepository } from './enrollment.repository';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';

/** Enrollments: a student in a group, with their plan and first cycle (US-08). */
@Module({
  imports: [StudentsModule, GroupsModule, PaymentsModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentRepository],
})
export class EnrollmentsModule {}
