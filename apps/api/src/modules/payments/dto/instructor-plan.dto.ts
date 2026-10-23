import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_SESSIONS_PER_CYCLE, PlanInputDto } from './plan-input.dto';

/** POST /instructors/{id}/payment-plans body (openapi.yaml: InstructorPlanCreate). */
export class InstructorPlanDto extends PlanInputDto {
  /**
   * The group this plan is for: an instructor is paid per group (ADR-0015), so a plan belongs to
   * an (instructor, group) pair. The first plan of a pair needs the instructor to be the group's
   * current instructor; the service checks it.
   */
  @IsUUID()
  groupId!: string;

  /**
   * Starting point (BR-14): sessions of the current cycle taken before the system, 0 to N-1. Only
   * for the first plan of the (instructor, group) pair; the service checks it against N.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SESSIONS_PER_CYCLE - 1)
  openingCount?: number;
}
