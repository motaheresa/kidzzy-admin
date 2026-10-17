import { IsUUID } from 'class-validator';
import { IsCalendarDate } from '../../../common/validation/is-calendar-date';

/** POST /students/{id}/transfer body (openapi.yaml: TransferRequest). */
export class TransferStudentDto {
  @IsUUID()
  toGroupId!: string;

  /** Academy-local date, YYYY-MM-DD: the first day in the new group. */
  @IsCalendarDate()
  effectiveDate!: string;
}
