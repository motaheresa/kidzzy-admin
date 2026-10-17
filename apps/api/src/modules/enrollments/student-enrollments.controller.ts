import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { Enrollment } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { TransferStudentDto } from './dto/transfer-student.dto';
import { EnrollmentsService } from './enrollments.service';

/**
 * /students/{id}/enrollments and /students/{id}/transfer (US-09). HTTP only: the DTO in, a
 * service call, the mapped response out. Each route's permission matches its x-permission in
 * openapi.yaml.
 */
@Controller('students/:id')
export class StudentEnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @RequirePermission('students.read')
  @Get('enrollments')
  async history(@Param('id', ParseUUIDPipe) studentId: string): Promise<{ data: Enrollment[] }> {
    return { data: await this.enrollments.listForStudent(studentId) };
  }

  @RequirePermission('enrollments.manage')
  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  transfer(
    @Param('id', ParseUUIDPipe) studentId: string,
    @Body() dto: TransferStudentDto,
  ): Promise<Enrollment> {
    return this.enrollments.transfer(studentId, dto);
  }
}
