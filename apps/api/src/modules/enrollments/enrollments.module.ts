import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { PaymentsModule } from '../payments/payments.module';
import { StudentsModule } from '../students/students.module';
import { EnrollmentRepository } from './enrollment.repository';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { StudentEnrollmentsController } from './student-enrollments.controller';

/** Enrollments: a student in a group, with their plan and first cycle (US-08). */
@Module({
  imports: [StudentsModule, GroupsModule, PaymentsModule],
  controllers: [EnrollmentsController, StudentEnrollmentsController],
  providers: [EnrollmentsService, EnrollmentRepository],
  exports: [EnrollmentRepository],
})
export class EnrollmentsModule {}
