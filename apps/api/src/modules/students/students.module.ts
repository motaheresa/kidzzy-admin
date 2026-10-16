import { Module } from '@nestjs/common';
import { StudentRepository } from './student.repository';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

/** Student records (US-05). AccessContext comes from the global AuthModule. */
@Module({
  controllers: [StudentsController],
  providers: [StudentsService, StudentRepository],
})
export class StudentsModule {}
