import { IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { IsCalendarDate } from '../../../common/validation/is-calendar-date';

/**
 * GET /groups/{id}/attendance query (openapi.yaml: getGroupAttendance). Both are academy-local
 * dates (YYYY-MM-DD) and both are included; from after to is a 400 in the service.
 */
export class GroupAttendanceQueryDto {
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;
}

/** GET /students/{id}/attendance query (openapi.yaml: getStudentAttendance). Paged only. */
export class StudentAttendanceQueryDto extends PageQueryDto {}
