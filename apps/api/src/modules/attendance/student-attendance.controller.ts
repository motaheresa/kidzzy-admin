import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { Page, StudentAttendanceItem } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { AttendanceViewsService } from './attendance-views.service';
import { StudentAttendanceQueryDto } from './dto/attendance-views.query';

/** /students/{id}/attendance (US-19). HTTP only; its permission matches x-permission. */
@Controller('students')
export class StudentAttendanceController {
  constructor(private readonly views: AttendanceViewsService) {}

  @RequirePermission('attendance.read')
  @Get(':id/attendance')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentAttendanceQueryDto,
  ): Promise<Page<StudentAttendanceItem>> {
    return this.views.ofStudent(id, query);
  }
}
