import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { IsCalendarDate } from '../../../common/validation/is-calendar-date';

/**
 * GET /payments query (openapi.yaml: listPayments). from and to are academy-local dates
 * (YYYY-MM-DD) and both are included; from after to is a 400 in the service. The filters are
 * combined with AND.
 */
export class ListPaymentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['student', 'instructor'])
  payeeType?: 'student' | 'instructor';

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string;

  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
