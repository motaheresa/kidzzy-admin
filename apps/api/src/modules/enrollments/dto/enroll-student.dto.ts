import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { IsCalendarDate } from '../../../common/validation/is-calendar-date';
import { MAX_SESSIONS_PER_CYCLE, PlanInputDto } from '../../payments/dto/plan-input.dto';

/** POST /groups/{id}/enrollments body (openapi.yaml: EnrollRequest). A plan is required (AC). */
export class EnrollStudentDto {
  @IsUUID()
  studentId!: string;

  /** Academy-local date, YYYY-MM-DD: the first day the student is in the group. */
  @IsCalendarDate()
  startDate!: string;

  // @ValidateNested alone lets a missing plan through; @IsObject makes it required.
  @IsObject()
  @ValidateNested()
  @Type(() => PlanInputDto)
  plan!: PlanInputDto;

  /**
   * Starting point (BR-14): sessions of the current cycle taken before the system, 0 to N-1.
   * Only for a student's first cycle; the service checks it against the plan's N.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SESSIONS_PER_CYCLE - 1)
  openingCount?: number;
}
