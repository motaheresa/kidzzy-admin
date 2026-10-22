import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_SESSIONS_PER_CYCLE, PlanInputDto } from './plan-input.dto';

/** POST /instructors/{id}/payment-plans body (openapi.yaml: InstructorPlanCreate). */
export class InstructorPlanDto extends PlanInputDto {
  /**
   * Starting point (BR-14): sessions of the current cycle taken before the system, 0 to N-1. Only
   * for the instructor's first plan; the service checks it against N.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SESSIONS_PER_CYCLE - 1)
  openingCount?: number;
}
