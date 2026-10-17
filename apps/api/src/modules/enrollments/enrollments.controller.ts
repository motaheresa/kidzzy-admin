import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { Enrollment } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { EnrollmentsService } from './enrollments.service';

/**
 * /groups/{id}/enrollments (US-08). HTTP only: the DTO in, a service call, the mapped response
 * out. Each route's permission matches its x-permission in openapi.yaml.
 */
@Controller('groups/:id/enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @RequirePermission('groups.read')
  @Get()
  async list(@Param('id', ParseUUIDPipe) groupId: string): Promise<{ data: Enrollment[] }> {
    return { data: await this.enrollments.listForGroup(groupId) };
  }

  @RequirePermission('enrollments.manage')
  @Post()
  enroll(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: EnrollStudentDto,
  ): Promise<Enrollment> {
    return this.enrollments.enroll(groupId, dto);
  }
}
