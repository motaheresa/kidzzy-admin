import { Module } from '@nestjs/common';
import { AcademiesModule } from '../academies/academies.module';
import { SessionsModule } from '../sessions/sessions.module';
import { StudentRepository } from './student.repository';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

/**
 * Student records (US-05). AccessContext comes from the global AuthModule. StudentRepository is
 * exported for enrollments (US-08), which lock and read the student.
 */
@Module({
  imports: [AcademiesModule, SessionsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentRepository],
  exports: [StudentRepository],
})
export class StudentsModule {}
