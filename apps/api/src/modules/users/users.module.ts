import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';

/**
 * Users (staff who log in). It owns UserRepository, which AuthModule imports for login and the
 * session. The instructor accounts (US-04) live in InstructorsModule.
 */
@Module({
  providers: [UserRepository],
  exports: [UserRepository],
})
export class UsersModule {}
