import { Module } from '@nestjs/common';
import { InstructorsModule } from '../instructors/instructors.module';
import { GroupRepository } from './group.repository';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

/** Groups and their weekly schedule (US-07). AccessContext comes from the global AuthModule. */
@Module({
  imports: [InstructorsModule],
  controllers: [GroupsController],
  providers: [GroupsService, GroupRepository],
})
export class GroupsModule {}
