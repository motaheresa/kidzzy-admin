import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import type { SessionAttendance } from '@kidzzy/shared';
import { RequirePermission } from '../auth/access.decorators';
import { AttendanceService } from './attendance.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';

/**
 * /sessions/{id}/attendance (US-18, US-37, US-19). HTTP only: the DTO in, a service call, the
 * mapped response out. Each route's permission matches its x-permission in openapi.yaml.
 */
@Controller('sessions')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @RequirePermission('attendance.read')
  @Get(':id/attendance')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SessionAttendance> {
    return this.attendance.get(id);
  }

  @RequirePermission('attendance.record')
  @Put(':id/attendance')
  @HttpCode(HttpStatus.OK)
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveAttendanceDto,
  ): Promise<SessionAttendance> {
    return this.attendance.save(id, body);
  }
}
