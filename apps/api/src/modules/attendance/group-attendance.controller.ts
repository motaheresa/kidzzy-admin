import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { GroupAttendance } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { AttendanceViewsService } from './attendance-views.service';
import { GroupAttendanceQueryDto } from './dto/attendance-views.query';

/** /groups/{id}/attendance (US-19). HTTP only; its permission matches x-permission. */
@Controller('groups')
export class GroupAttendanceController {
  constructor(private readonly views: AttendanceViewsService) {}

  @RequirePermission('attendance.read')
  @Get(':id/attendance')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GroupAttendanceQueryDto,
  ): Promise<GroupAttendance> {
    return this.views.ofGroup(id, query);
  }
}
