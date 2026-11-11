import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../../common/validation/is-calendar-date';

/**
 * ?from&to of a finance report (openapi.yaml: getFinanceReport). Academy-local dates, YYYY-MM-DD,
 * both included. A missing one is the edge of the current local month; `to` before `from` is a
 * 400 and a period of more than 366 days is a 422, both decided in resolvePeriod.
 */
export class ReportPeriodQueryDto {
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
