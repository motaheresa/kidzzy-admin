import { Module } from '@nestjs/common';
import { InstructorsModule } from '../instructors/instructors.module';
import { SessionsModule } from '../sessions/sessions.module';
import { GroupRepository } from './group.repository';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

/**
 * Groups and their weekly schedule (US-07). AccessContext comes from the global AuthModule.
 * GroupRepository is exported for enrollments (US-08).
 */
@Module({
  imports: [InstructorsModule, SessionsModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupRepository],
  exports: [GroupRepository],
})
export class GroupsModule {}
