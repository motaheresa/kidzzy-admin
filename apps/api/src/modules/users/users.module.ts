import { Module } from '@nestjs/common';
import { UserRepository } from './user.repository';

/**
 * Users (staff who log in). For now it only owns UserRepository, which AuthModule imports;
 * the instructor endpoints (US-04) will add their controller and service here.
 */
@Module({
  providers: [UserRepository],
  exports: [UserRepository],
})
export class UsersModule {}
