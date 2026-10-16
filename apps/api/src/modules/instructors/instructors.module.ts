import { Module } from '@nestjs/common';
import { InstructorRepository } from './instructor.repository';
import { InstructorsController } from './instructors.controller';
import { InstructorsService } from './instructors.service';

/**
 * Instructor accounts (US-04). An instructor is a user with the Instructor role, so this module
 * reads the users table through its own InstructorRepository, which only ever sees that role.
 * PasswordService, AuthService and AccessContext come from the global AuthModule.
 */
@Module({
  controllers: [InstructorsController],
  providers: [InstructorsService, InstructorRepository],
})
export class InstructorsModule {}
